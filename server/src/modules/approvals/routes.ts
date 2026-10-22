import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Approval, APPROVAL_TYPES } from '../../models/Approval.js';
import { Transaction } from '../../models/Transaction.js';
import { Payroll } from '../../models/Payroll.js';
import { Budget } from '../../models/Budget.js';
import { Invoice } from '../../models/Invoice.js';
import { paginate } from '../../utils/pagination.js';
import { AppError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { notifyCeos, notifyUsers } from '../../utils/notify.js';
import { User } from '../../models/User.js';
import { getSettings } from '../../models/Settings.js';
import { adjustBankBalance, directionForTxType } from '../../utils/bankLedger.js';
import { memoryCache } from '../../utils/cache.js';

const router = Router();
router.use(authenticate);

async function applyApprovalSideEffects(approval: InstanceType<typeof Approval>, approved: boolean) {
  const status = approved ? 'approved' : 'rejected';
  if (approval.refModel === 'Transaction') {
    const tx = await Transaction.findById(approval.refId);
    if (tx) {
      const previousStatus = tx.status;
      tx.status = approved ? 'approved' : 'rejected';
      await tx.save();

      // Mirror create-approved path: only move bank funds when leaving pending → approved
      if (
        approved &&
        previousStatus === 'pending' &&
        (tx.type === 'revenue' || tx.type === 'expense')
      ) {
        await adjustBankBalance({
          bankAccountId: tx.bankAccount ? String(tx.bankAccount) : undefined,
          amount: tx.amount,
          direction: directionForTxType(tx.type),
        });
        memoryCache.delPrefix('finance');
      }
    }
  } else if (approval.refModel === 'Payroll') {
    await Payroll.findByIdAndUpdate(approval.refId, {
      status: approved ? 'approved' : 'rejected',
    });
  } else if (approval.refModel === 'Budget') {
    await Budget.findByIdAndUpdate(approval.refId, {
      status: approved ? 'locked' : 'rejected',
    });
  } else if (approval.refModel === 'Invoice') {
    await Invoice.findByIdAndUpdate(approval.refId, {
      status: approved ? 'sent' : 'rejected',
    });
  }

  const requester = await User.findById(approval.requestedBy);
  if (requester) {
    await notifyUsers([String(requester._id)], {
      type: 'approval',
      title: approved ? 'Request approved' : 'Request rejected',
      message: `${approval.title} was ${status}${approval.reason ? `: ${approval.reason}` : ''}`,
      link: '/approvals',
    });
  }
}

router.get(
  '/',
  authorize('approvals', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.user!.role !== 'ceo') filter.requestedBy = req.user!.id;

    const data = await paginate(Approval, filter, req, ['requestedBy', 'decidedBy']);

    const totals = await Approval.aggregate([
      ...(req.user!.role !== 'ceo'
        ? [{ $match: { requestedBy: new (await import('mongoose')).default.Types.ObjectId(req.user!.id) } }]
        : []),
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: {
        ...data,
        tabTotals: totals.reduce(
          (acc, t) => {
            acc[t._id] = { count: t.count, amount: t.amount };
            return acc;
          },
          {} as Record<string, { count: number; amount: number }>
        ),
      },
    });
  })
);

router.post(
  '/',
  authorize('approvals', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.enum(APPROVAL_TYPES),
        refModel: z.string(),
        refId: z.string(),
        amount: z.number().min(0),
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      })
      .parse(req.body);

    const settings = await getSettings();
    if (body.amount < settings.approvalRules.autoApproveUnder) {
      const approval = await Approval.create({
        ...body,
        requestedBy: req.user!.id,
        status: 'approved',
        decidedBy: req.user!.id,
        decidedAt: new Date(),
        reason: 'Auto-approved under threshold',
        history: [
          { action: 'submitted', by: req.user!.id, at: new Date() },
          { action: 'auto_approved', by: req.user!.id, at: new Date(), note: 'Under threshold' },
        ],
      });
      await applyApprovalSideEffects(approval, true);
      return res.status(201).json({ success: true, data: approval });
    }

    const approval = await Approval.create({
      ...body,
      priority:
        body.priority ||
        (body.amount >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'medium'),
      requestedBy: req.user!.id,
      status: 'pending',
      history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
    });

    await notifyCeos({
      type: 'approval',
      title: 'Approval requested',
      message: `${req.user!.email} submitted "${approval.title}" (₹${approval.amount}) for approval`,
      link: '/approvals',
    });

    res.status(201).json({ success: true, data: approval });
  })
);

router.post(
  '/:id/approve',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const approval = await Approval.findById(req.params.id);
    if (!approval) throw new NotFoundError('Approval not found');
    if (approval.status !== 'pending' && approval.status !== 'changes_requested') {
      throw new AppError('Approval is not pending', 400);
    }
    approval.status = 'approved';
    approval.decidedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
    approval.decidedAt = new Date();
    approval.history.push({
      action: 'approved',
      by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      at: new Date(),
    });
    await approval.save();
    await applyApprovalSideEffects(approval, true);
    await writeAudit({
      actor: req.user!.id,
      action: 'approve',
      entity: 'Approval',
      entityId: approval._id.toString(),
      after: approval,
      req,
    });
    res.json({ success: true, data: approval });
  })
);

router.post(
  '/:id/reject',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const approval = await Approval.findById(req.params.id);
    if (!approval) throw new NotFoundError('Approval not found');
    if (approval.status !== 'pending' && approval.status !== 'changes_requested') {
      throw new AppError('Approval is not pending', 400);
    }
    approval.status = 'rejected';
    approval.reason = reason;
    approval.decidedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
    approval.decidedAt = new Date();
    approval.history.push({
      action: 'rejected',
      by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      at: new Date(),
      note: reason,
    });
    await approval.save();
    await applyApprovalSideEffects(approval, false);
    await writeAudit({
      actor: req.user!.id,
      action: 'reject',
      entity: 'Approval',
      entityId: approval._id.toString(),
      after: approval,
      req,
    });
    res.json({ success: true, data: approval });
  })
);

router.post(
  '/:id/request-changes',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const approval = await Approval.findById(req.params.id);
    if (!approval) throw new NotFoundError('Approval not found');
    if (approval.status !== 'pending') {
      throw new AppError('Approval is not pending', 400);
    }
    approval.status = 'changes_requested';
    approval.reason = reason;
    approval.history.push({
      action: 'changes_requested',
      by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      at: new Date(),
      note: reason,
    });
    await approval.save();
    res.json({ success: true, data: approval });
  })
);

router.post(
  '/bulk',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const { ids, action, reason } = z
      .object({
        ids: z.array(z.string()).min(1),
        action: z.enum(['approve', 'reject']),
        reason: z.string().optional(),
      })
      .parse(req.body);

    if (action === 'reject' && !reason) throw new AppError('Reason required for reject', 400);

    const results = [];
    for (const id of ids) {
      const approval = await Approval.findById(id);
      if (!approval || approval.status !== 'pending') continue;
      approval.status = action === 'approve' ? 'approved' : 'rejected';
      approval.reason = reason;
      approval.decidedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
      approval.decidedAt = new Date();
      approval.history.push({
        action: action === 'approve' ? 'approved' : 'rejected',
        by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
        at: new Date(),
        note: reason,
      });
      await approval.save();
      await applyApprovalSideEffects(approval, action === 'approve');
      results.push(approval);
    }
    res.json({ success: true, data: results });
  })
);

export default router;
