import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Alert } from '../../models/Alert.js';
import { Notification } from '../../models/Notification.js';
import { Approval } from '../../models/Approval.js';
import { PaymentRequest } from '../../models/PaymentRequest.js';
import { Conversation } from '../../models/Conversation.js';
import { ChatMessage } from '../../models/ChatMessage.js';
import { paginate } from '../../utils/pagination.js';
import { NotFoundError } from '../../utils/AppError.js';
import { runAlertEngine } from '../../jobs/alertEngine.js';

const router = Router();
router.use(authenticate);

const PAYMENT_REQUEST_APPROVAL_TYPES = ['payment_request', 'payment_request_proof'];

router.get(
  '/',
  authorize('alerts', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.status) filter.status = req.query.status;
    // Non-executives only see alerts assigned to them (or unscoped company alerts for managers)
    if (req.user!.role === 'employee' || req.user!.role === 'finance') {
      filter.user = req.user!.id;
    }
    const data = await paginate(Alert, filter, req);
    res.json({ success: true, data });
  })
);

router.get(
  '/notifications',
  authorize('notifications', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { user: req.user!.id };
    if (req.query.unread === '1') filter.readAt = null;
    if (req.query.type) filter.type = String(req.query.type);
    const data = await paginate(Notification, filter, req);
    const unread = await Notification.countDocuments({ user: req.user!.id, readAt: null });
    res.json({ success: true, data: { ...data, unread } });
  })
);

router.patch(
  '/notifications/read',
  authorize('notifications', 'update'),
  asyncHandler(async (req, res) => {
    const body = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }).parse(req.body);
    if (body.all) {
      await Notification.updateMany({ user: req.user!.id, readAt: null }, { readAt: new Date() });
    } else if (body.ids?.length) {
      await Notification.updateMany(
        { _id: { $in: body.ids }, user: req.user!.id },
        { readAt: new Date() }
      );
    }
    res.json({ success: true, data: { ok: true } });
  })
);

router.patch(
  '/notifications/:id/read',
  authorize('notifications', 'update'),
  asyncHandler(async (req, res) => {
    const note = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { readAt: new Date() },
      { new: true }
    );
    if (!note) throw new NotFoundError('Notification not found');
    res.json({ success: true, data: note });
  })
);

function projectNotifFilter(userId: string) {
  return {
    user: userId,
    readAt: null,
    $or: [
      { type: { $regex: /project/i } },
      { link: { $regex: /\/projects/i } },
      { link: { $regex: /\/tasks\?project=/i } },
    ],
  };
}

function paymentNotifFilter(userId: string) {
  return {
    user: userId,
    readAt: null,
    $or: [{ type: 'payment_request' }, { link: { $regex: /payment-requests/i } }],
  };
}

function approvalNotifFilter(userId: string) {
  return {
    user: userId,
    readAt: null,
    type: { $in: ['approval', 'expense', 'payroll', 'invoice', 'reimbursement', 'vendor_payment'] },
    $and: [
      {
        $or: [{ link: { $exists: false } }, { link: null }, { link: { $not: /payment-requests/i } }],
      },
    ],
  };
}

function meetingNotifFilter(userId: string) {
  return {
    user: userId,
    readAt: null,
    $or: [{ type: 'meeting' }, { link: { $regex: /\/meetings/i } }],
  };
}

/** Live sidebar badge counts — actionable queue sizes + unread chat/project alerts only (no stale Math.max). */
router.get(
  '/sidebar-badges',
  authorize('notifications', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const uid = new mongoose.Types.ObjectId(userId);

    const [pendingApprovals, paymentActionable, projectNotifs, meetingNotifs, conversationIds] =
      await Promise.all([
        role === 'ceo'
          ? Approval.countDocuments({
              status: 'pending',
              type: { $nin: PAYMENT_REQUEST_APPROVAL_TYPES },
            })
          : Promise.resolve(0),
        role === 'ceo'
          ? PaymentRequest.countDocuments({
              status: { $in: ['pending', 'awaiting_final_approval'] },
            })
          : PaymentRequest.countDocuments({
              createdBy: userId,
              status: { $in: ['approved', 'awaiting_final_approval'] },
            }),
        Notification.countDocuments(projectNotifFilter(userId)),
        Notification.countDocuments(meetingNotifFilter(userId)),
        Conversation.find({ members: uid }).select('_id').lean(),
      ]);

    const convIds = conversationIds.map((c) => c._id);
    const chat =
      convIds.length === 0
        ? 0
        : await ChatMessage.countDocuments({
            conversation: { $in: convIds },
            sender: { $ne: uid },
            readBy: { $ne: uid },
            deletedFor: { $ne: uid },
            deletedForEveryoneAt: { $exists: false },
          });

    res.json({
      success: true,
      data: {
        projects: projectNotifs,
        paymentRequests: paymentActionable,
        approvals: pendingApprovals,
        chat,
        meetings: meetingNotifs,
        updatedAt: new Date().toISOString(),
      },
    });
  })
);

/** Mark related notifications read when opening a sidebar section. */
router.post(
  '/sidebar-badges/ack',
  authorize('notifications', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        scopes: z
          .array(z.enum(['projects', 'paymentRequests', 'approvals', 'chat', 'meetings']))
          .min(1),
      })
      .parse(req.body);

    const userId = req.user!.id;
    const now = new Date();
    const results: Record<string, number> = {};

    for (const scope of body.scopes) {
      let filter: Record<string, unknown> | null = null;
      if (scope === 'projects') filter = projectNotifFilter(userId);
      if (scope === 'paymentRequests') filter = paymentNotifFilter(userId);
      if (scope === 'approvals') filter = approvalNotifFilter(userId);
      if (scope === 'meetings') filter = meetingNotifFilter(userId);
      // chat unread is message-level; opening Chat page handles read receipts per conversation
      if (scope === 'chat') {
        results.chat = 0;
        continue;
      }
      if (!filter) continue;
      const updated = await Notification.updateMany(filter, { $set: { readAt: now } });
      results[scope] = updated.modifiedCount || 0;
    }

    res.json({ success: true, data: { ok: true, marked: results } });
  })
);

router.post(
  '/run',
  requireRoles('ceo'),
  asyncHandler(async (_req, res) => {
    await runAlertEngine();
    res.json({ success: true, data: { ok: true } });
  })
);

router.patch(
  '/:id',
  authorize('alerts', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['open', 'snoozed', 'resolved']).optional(),
        snoozedUntil: z.coerce.date().optional(),
      })
      .parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.status === 'resolved') update.resolvedAt = new Date();
    const alert = await Alert.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!alert) throw new NotFoundError('Alert not found');
    res.json({ success: true, data: alert });
  })
);

export default router;
