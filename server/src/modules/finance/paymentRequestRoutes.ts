import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { paginate } from '../../utils/pagination.js';
import { notifyCeos, notifyUsers } from '../../utils/notify.js';
import { upload, finalizeUploadedFile } from '../../middleware/upload.js';
import { Approval } from '../../models/Approval.js';
import { Transaction } from '../../models/Transaction.js';
import { FinanceCategory } from '../../models/FinanceCategory.js';
import {
  PaymentRequest,
  nextPaymentRequestNumber,
  DEFAULT_PAYMENT_REQUEST_CATEGORIES,
} from '../../models/PaymentRequest.js';
import { getSettings } from '../../models/Settings.js';
import { memoryCache } from '../../utils/cache.js';
import {
  extractTextFromImageOCR,
  extractTextFromPDF,
} from './documentScanner.js';
import { analyzePaymentScreenshot } from './paymentRequestOcr.js';

const router = Router();
router.use(authenticate);

function paramId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0] || '';
  return id || '';
}

function hasPaymentDetail(details: {
  upiId?: string;
  bankAccountNumber?: string;
  qrCode?: { url?: string };
}): boolean {
  return !!(
    (details.upiId && details.upiId.trim()) ||
    (details.bankAccountNumber && details.bankAccountNumber.trim()) ||
    details.qrCode?.url
  );
}

function pushHistory(
  doc: InstanceType<typeof PaymentRequest>,
  action: string,
  by: string,
  note?: string
) {
  doc.history.push({
    action,
    by: by as unknown as import('mongoose').Types.ObjectId,
    at: new Date(),
    note,
  });
}

async function ensurePaymentRequestCategories() {
  await Promise.all(
    DEFAULT_PAYMENT_REQUEST_CATEGORIES.map((name) =>
      FinanceCategory.updateOne(
        { type: 'payment_request', name },
        {
          $setOnInsert: {
            name,
            type: 'payment_request',
            isDefault: true,
            isActive: true,
          },
        },
        { upsert: true }
      ).catch(() => null)
    )
  );
}

async function resolveCategoryName(category: string): Promise<string> {
  await ensurePaymentRequestCategories();
  const found = await FinanceCategory.findOne({
    type: 'payment_request',
    isActive: true,
    name: { $regex: new RegExp(`^${category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).lean();
  if (found) return found.name;
  if (
    (DEFAULT_PAYMENT_REQUEST_CATEGORIES as readonly string[]).some(
      (c) => c.toLowerCase() === category.trim().toLowerCase()
    )
  ) {
    return category.trim();
  }
  throw new AppError('Invalid payment request category', 400);
}

async function createAmountApproval(pr: InstanceType<typeof PaymentRequest>, userId: string, email: string) {
  const settings = await getSettings();
  const approval = await Approval.create({
    type: 'payment_request',
    refModel: 'PaymentRequest',
    refId: pr._id,
    amount: pr.amount,
    currency: pr.currency,
    title: `Payment Request #${pr.requestNumber}: ${pr.payeeName}`,
    description: `${pr.category} — ${pr.description}`,
    priority: pr.amount >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'medium',
    requestedBy: userId,
    status: 'pending',
    history: [{ action: 'submitted', by: userId, at: new Date() }],
  });
  pr.amountApproval = approval._id;
  await notifyCeos({
    type: 'payment_request',
    title: 'Payment request pending approval',
    message: `${email} submitted Payment Request #${pr.requestNumber} for ₹${pr.amount} (${pr.payeeName})`,
    link: '/finance/payment-requests',
  });
  return approval;
}

async function createProofApproval(pr: InstanceType<typeof PaymentRequest>, userId: string, email: string) {
  const settings = await getSettings();
  const approval = await Approval.create({
    type: 'payment_request_proof',
    refModel: 'PaymentRequest',
    refId: pr._id,
    amount: pr.approvedAmount ?? pr.amount,
    currency: pr.currency,
    title: `Payment proof #${pr.requestNumber}: ${pr.payeeName}`,
    description: `Screenshot uploaded for final owner approval — ${pr.description}`,
    priority: (pr.approvedAmount ?? pr.amount) >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'medium',
    requestedBy: userId,
    status: 'pending',
    history: [{ action: 'submitted', by: userId, at: new Date() }],
  });
  pr.proofApproval = approval._id;
  await notifyCeos({
    type: 'payment_request',
    title: 'Payment proof awaiting final approval',
    message: `${email} uploaded proof for Payment Request #${pr.requestNumber}`,
    link: '/finance/payment-requests',
  });
  return approval;
}

async function markPaidAndCreateFinanceEntry(
  pr: InstanceType<typeof PaymentRequest>,
  userId: string
) {
  if (pr.transaction) {
    pr.status = 'paid';
    return;
  }

  const tx = await Transaction.create({
    type: 'expense',
    category: pr.category,
    amount: pr.approvedAmount ?? pr.amount,
    title: `Payment Request #${pr.requestNumber} — ${pr.payeeName}`,
    description: pr.description,
    currency: pr.currency,
    date: new Date(),
    paymentRequest: pr._id,
    receipt: pr.screenshot
      ? { name: pr.screenshot.name, url: pr.screenshot.url }
      : undefined,
    attachment: pr.screenshot
      ? {
          name: pr.screenshot.name,
          url: pr.screenshot.url,
          mime: pr.screenshot.mime,
          size: pr.screenshot.size,
          hash: pr.screenshot.hash,
        }
      : undefined,
    paymentMethod: pr.paymentDetails?.upiId ? 'UPI' : 'Bank Transfer',
    status: 'paid',
    invoiceNumber: pr.transactionId || undefined,
    notes: [
      `Payment Request #${pr.requestNumber}`,
      pr.transactionId ? `Txn/UTR: ${pr.transactionId}` : null,
      pr.noTransactionId ? 'Flag: No Transaction ID' : null,
    ]
      .filter(Boolean)
      .join('\n'),
    createdBy: userId,
  });

  pr.transaction = tx._id;
  pr.status = 'paid';
  memoryCache.delPrefix('finance');
}

/** Shared helpers used by Approvals page side-effects */
export async function applyPaymentRequestAmountDecision(
  paymentRequestId: string,
  approved: boolean,
  actorId: string,
  reason?: string
) {
  const pr = await PaymentRequest.findById(paymentRequestId);
  if (!pr) return null;
  if (pr.status !== 'pending') return pr;

  if (approved) {
    pr.status = 'approved';
    pr.approvedAmount = pr.amount;
    pr.approvedBy = actorId as unknown as import('mongoose').Types.ObjectId;
    pr.approvedAt = new Date();
    pushHistory(pr, 'amount_approved', actorId, 'Owner approved amount for payment');
  } else {
    pr.status = 'rejected';
    pr.rejectedBy = actorId as unknown as import('mongoose').Types.ObjectId;
    pr.rejectedAt = new Date();
    pr.rejectionReason = reason;
    pushHistory(pr, 'rejected', actorId, reason || 'Rejected by owner');
  }
  await pr.save();

  await notifyUsers([String(pr.createdBy)], {
    type: 'payment_request',
    title: approved ? 'Payment request approved' : 'Payment request rejected',
    message: `Payment Request #${pr.requestNumber} was ${approved ? 'approved for payment' : 'rejected'}${
      reason ? `: ${reason}` : ''
    }`,
    link: '/finance/payment-requests',
  });

  return pr;
}

export async function applyPaymentRequestProofDecision(
  paymentRequestId: string,
  approved: boolean,
  actorId: string,
  reason?: string
) {
  const pr = await PaymentRequest.findById(paymentRequestId);
  if (!pr) return null;
  if (pr.status !== 'awaiting_final_approval') return pr;

  if (approved) {
    await markPaidAndCreateFinanceEntry(pr, actorId);
    pr.finalApprovedBy = actorId as unknown as import('mongoose').Types.ObjectId;
    pr.finalApprovedAt = new Date();
    pushHistory(pr, 'proof_approved', actorId, 'Owner confirmed payment proof — marked Paid');
  } else {
    // Stay unpaid; clear screenshot so payer can re-upload after correction
    pr.status = 'approved';
    pr.flags = {
      ...pr.flags,
      needsManualReview: true,
      ocrUnclear: pr.flags?.ocrUnclear || false,
    };
    pushHistory(
      pr,
      'proof_rejected',
      actorId,
      reason || 'Owner rejected screenshot — returned for correction'
    );
    pr.screenshot = undefined;
    pr.ocr = undefined;
    pr.screenshotUploadedAt = undefined;
    pr.screenshotUploadedBy = undefined;
  }
  await pr.save();

  await notifyUsers([String(pr.createdBy), String(pr.screenshotUploadedBy || pr.createdBy)].filter(Boolean), {
    type: 'payment_request',
    title: approved ? 'Payment confirmed as Paid' : 'Payment proof needs correction',
    message: `Payment Request #${pr.requestNumber}: ${
      approved ? 'marked Paid and added to Finance' : reason || 'screenshot rejected'
    }`,
    link: '/finance/payment-requests',
  });

  return pr;
}

// GET /api/v1/finance/payment-requests
router.get(
  '/',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.flag === 'no_transaction_id') filter.noTransactionId = true;
    if (req.query.flag === 'disputed') filter.status = 'disputed';
    if (req.query.search) {
      const q = String(req.query.search).trim();
      filter.$or = [
        { payeeName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { transactionId: { $regex: q, $options: 'i' } },
      ];
      const asNum = Number(q.replace(/\D/g, ''));
      if (!Number.isNaN(asNum) && asNum > 0) {
        (filter.$or as unknown[]).push({ requestNumber: asNum });
      }
    }

    // Non-CEO/finance see own + approved queue they can act on
    if (!['ceo', 'finance'].includes(req.user!.role)) {
      // Still allow listing all they create; managers can see approved unpaid for upload
      if (req.query.scope === 'mine') {
        filter.createdBy = req.user!.id;
      }
    }

    const data = await paginate(PaymentRequest, filter, req, [
      'createdBy',
      'approvedBy',
      'rejectedBy',
      'screenshotUploadedBy',
      'finalApprovedBy',
      'disputedBy',
      'history.by',
    ]);

    const counts = await PaymentRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        ...data,
        statusCounts: counts.reduce(
          (acc, row) => {
            acc[row._id] = row.count;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
    });
  })
);

// GET /api/v1/finance/payment-requests/:id
router.get(
  '/:id',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const pr = await PaymentRequest.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('screenshotUploadedBy', 'name email')
      .populate('finalApprovedBy', 'name email')
      .populate('disputedBy', 'name email')
      .populate('history.by', 'name email')
      .populate('transaction');
    if (!pr) throw new NotFoundError('Payment request not found');
    res.json({ success: true, data: pr });
  })
);

// POST /api/v1/finance/payment-requests
router.post(
  '/',
  authorize('transactions', 'create'),
  upload.single('qrCode'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        payeeName: z.string().min(2).max(120),
        amount: z.coerce.number().positive(),
        description: z.string().min(2).max(2000),
        category: z.string().min(2).max(80),
        upiId: z.string().max(120).optional().or(z.literal('')),
        bankAccountNumber: z.string().max(40).optional().or(z.literal('')),
        bankIfsc: z.string().max(20).optional().or(z.literal('')),
        bankName: z.string().max(120).optional().or(z.literal('')),
        accountHolderName: z.string().max(120).optional().or(z.literal('')),
        paymentNotes: z.string().max(500).optional().or(z.literal('')),
        currency: z.string().max(8).optional(),
      })
      .parse(req.body);

    const category = await resolveCategoryName(body.category);

    let qrCode: { name: string; url: string; mime?: string; size?: number } | undefined;
    if (req.file) {
      const file = await finalizeUploadedFile(req.file);
      qrCode = { name: file.name, url: file.url, mime: file.mime, size: file.size };
    }

    const paymentDetails = {
      upiId: body.upiId?.trim() || undefined,
      bankAccountNumber: body.bankAccountNumber?.trim() || undefined,
      bankIfsc: body.bankIfsc?.trim()?.toUpperCase() || undefined,
      bankName: body.bankName?.trim() || undefined,
      accountHolderName: body.accountHolderName?.trim() || undefined,
      qrCode,
      notes: body.paymentNotes?.trim() || undefined,
    };

    if (!hasPaymentDetail(paymentDetails)) {
      throw new AppError('Provide at least one of QR code, UPI ID, or bank account details', 400);
    }

    const requestNumber = await nextPaymentRequestNumber();
    const pr = await PaymentRequest.create({
      requestNumber,
      payeeName: body.payeeName.trim(),
      paymentDetails,
      amount: body.amount,
      currency: body.currency || 'INR',
      description: body.description.trim(),
      category,
      status: 'pending',
      createdBy: req.user!.id,
      history: [
        {
          action: 'created',
          by: req.user!.id,
          at: new Date(),
          note: 'Payment request submitted for owner approval',
        },
      ],
    });

    await createAmountApproval(pr, req.user!.id, req.user!.email);
    await pr.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });

    const populated = await PaymentRequest.findById(pr._id).populate('createdBy', 'name email role');
    res.status(201).json({ success: true, data: populated });
  })
);

// PATCH /api/v1/finance/payment-requests/:id  (amount change → re-approval)
router.patch(
  '/:id',
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    const pr = await PaymentRequest.findById(req.params.id);
    if (!pr) throw new NotFoundError('Payment request not found');

    if (!['pending', 'approved'].includes(pr.status)) {
      throw new AppError('Only pending or approved (unpaid) requests can be updated', 400);
    }

    const isOwner = ['ceo', 'finance'].includes(req.user!.role);
    if (!isOwner && String(pr.createdBy) !== req.user!.id) {
      throw new ForbiddenError('You can only update your own payment requests');
    }

    const body = z
      .object({
        payeeName: z.string().min(2).max(120).optional(),
        amount: z.coerce.number().positive().optional(),
        description: z.string().min(2).max(2000).optional(),
        category: z.string().min(2).max(80).optional(),
        upiId: z.string().max(120).optional(),
        bankAccountNumber: z.string().max(40).optional(),
        bankIfsc: z.string().max(20).optional(),
        bankName: z.string().max(120).optional(),
        accountHolderName: z.string().max(120).optional(),
        paymentNotes: z.string().max(500).optional(),
      })
      .parse(req.body);

    if (body.payeeName) pr.payeeName = body.payeeName.trim();
    if (body.description) pr.description = body.description.trim();
    if (body.category) pr.category = await resolveCategoryName(body.category);
    if (body.upiId !== undefined) pr.paymentDetails.upiId = body.upiId.trim() || undefined;
    if (body.bankAccountNumber !== undefined) {
      pr.paymentDetails.bankAccountNumber = body.bankAccountNumber.trim() || undefined;
    }
    if (body.bankIfsc !== undefined) {
      pr.paymentDetails.bankIfsc = body.bankIfsc.trim().toUpperCase() || undefined;
    }
    if (body.bankName !== undefined) pr.paymentDetails.bankName = body.bankName.trim() || undefined;
    if (body.accountHolderName !== undefined) {
      pr.paymentDetails.accountHolderName = body.accountHolderName.trim() || undefined;
    }
    if (body.paymentNotes !== undefined) {
      pr.paymentDetails.notes = body.paymentNotes.trim() || undefined;
    }

    const amountChanged = body.amount !== undefined && Math.abs(body.amount - pr.amount) >= 0.01;
    if (amountChanged) {
      pr.amount = body.amount!;
      // Spec: different amount requires owner re-approval before payment
      if (pr.status === 'approved') {
        pr.status = 'pending';
        pr.approvedAmount = undefined;
        pr.approvedBy = undefined;
        pr.approvedAt = undefined;
        pushHistory(
          pr,
          'amount_revised',
          req.user!.id,
          `Amount changed to ₹${body.amount} — sent for owner re-approval`
        );

        if (pr.amountApproval) {
          await Approval.findByIdAndUpdate(pr.amountApproval, {
            status: 'rejected',
            reason: 'Superseded by amount revision',
            decidedAt: new Date(),
          }).catch(() => null);
        }
        await createAmountApproval(pr, req.user!.id, req.user!.email);
      } else {
        pushHistory(pr, 'updated', req.user!.id, `Amount set to ₹${body.amount}`);
        if (pr.amountApproval) {
          await Approval.findByIdAndUpdate(pr.amountApproval, { amount: pr.amount }).catch(() => null);
        }
      }
    } else {
      pushHistory(pr, 'updated', req.user!.id, 'Payment request details updated');
    }

    if (!hasPaymentDetail(pr.paymentDetails)) {
      throw new AppError('Provide at least one of QR code, UPI ID, or bank account details', 400);
    }

    await pr.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });

    res.json({ success: true, data: pr });
  })
);

// POST /:id/approve-amount  (CEO — step 1)
router.post(
  '/:id/approve-amount',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const existing = await PaymentRequest.findById(id);
    if (!existing) throw new NotFoundError('Payment request not found');
    if (existing.status !== 'pending') {
      throw new AppError('Payment request is not pending amount approval', 400);
    }
    const pr = await applyPaymentRequestAmountDecision(id, true, req.user!.id);
    if (!pr) throw new NotFoundError('Payment request not found');
    if (pr.amountApproval) {
      await Approval.findByIdAndUpdate(pr.amountApproval, {
        $set: {
          status: 'approved',
          decidedBy: req.user!.id,
          decidedAt: new Date(),
        },
        $push: { history: { action: 'approved', by: req.user!.id, at: new Date() } },
      }).catch(() => null);
    }
    await writeAudit({
      actor: req.user!.id,
      action: 'approve',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });
    res.json({ success: true, data: pr });
  })
);

// POST /:id/reject  (CEO — amount or general reject while pending)
router.post(
  '/:id/reject',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const id = paramId(req.params.id);
    const existing = await PaymentRequest.findById(id);
    if (!existing) throw new NotFoundError('Payment request not found');

    if (existing.status === 'pending') {
      const pr = await applyPaymentRequestAmountDecision(id, false, req.user!.id, reason);
      if (pr?.amountApproval) {
        await Approval.findByIdAndUpdate(pr.amountApproval, {
          $set: {
            status: 'rejected',
            reason,
            decidedBy: req.user!.id,
            decidedAt: new Date(),
          },
          $push: { history: { action: 'rejected', by: req.user!.id, at: new Date(), note: reason } },
        }).catch(() => null);
      }
      await writeAudit({
        actor: req.user!.id,
        action: 'reject',
        entity: 'PaymentRequest',
        entityId: existing._id.toString(),
        after: pr,
        req,
      });
      return res.json({ success: true, data: pr });
    }

    if (existing.status === 'awaiting_final_approval') {
      const pr = await applyPaymentRequestProofDecision(id, false, req.user!.id, reason);
      if (pr?.proofApproval) {
        await Approval.findByIdAndUpdate(pr.proofApproval, {
          $set: {
            status: 'rejected',
            reason,
            decidedBy: req.user!.id,
            decidedAt: new Date(),
          },
          $push: { history: { action: 'rejected', by: req.user!.id, at: new Date(), note: reason } },
        }).catch(() => null);
      }
      return res.json({ success: true, data: pr });
    }

    throw new AppError('This payment request cannot be rejected in its current status', 400);
  })
);

// POST /:id/upload-screenshot
router.post(
  '/:id/upload-screenshot',
  authorize('transactions', 'create'),
  upload.single('screenshot'),
  asyncHandler(async (req, res) => {
    const pr = await PaymentRequest.findById(req.params.id);
    if (!pr) throw new NotFoundError('Payment request not found');
    if (pr.status !== 'approved') {
      throw new AppError('Screenshot upload is only available after amount approval (and while unpaid)', 400);
    }
    if (!req.file) throw new AppError('Payment screenshot is required', 400);

    const optionalTxnId = z
      .object({ transactionId: z.string().max(40).optional().or(z.literal('')) })
      .parse(req.body).transactionId?.trim();

    const file = await finalizeUploadedFile(req.file);
    let hash: string | undefined;
    try {
      const buf = fs.readFileSync(req.file.path);
      hash = crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
      hash = undefined;
    }

    // OCR assist (does NOT mark paid)
    let rawText = '';
    try {
      if (file.mime === 'application/pdf') {
        rawText = await extractTextFromPDF(fs.readFileSync(req.file.path));
      } else {
        rawText = await extractTextFromImageOCR(req.file.path);
      }
    } catch (err) {
      console.warn('[PaymentRequest] OCR failed:', err);
      rawText = '';
    }

    const ocr = analyzePaymentScreenshot(rawText, pr);
    const mismatches = [...(ocr.mismatches || [])];

    let txnId = (optionalTxnId || ocr.transactionId || '').trim().toUpperCase() || undefined;
    let txnUnique = true;
    if (txnId) {
      const duplicate = await PaymentRequest.findOne({
        _id: { $ne: pr._id },
        transactionId: txnId,
        status: { $in: ['awaiting_final_approval', 'paid', 'disputed'] },
      })
        .select('_id requestNumber')
        .lean();
      if (duplicate) {
        txnUnique = false;
        mismatches.push(
          `Transaction ID already used on Payment Request #${duplicate.requestNumber}`
        );
        ocr.matched = { ...(ocr.matched || {}), transactionIdUnique: false };
      }
    }

    const amountMismatch =
      ocr.amount != null &&
      Math.abs(ocr.amount - Number(pr.approvedAmount ?? pr.amount)) >= 0.5;

    // If OCR amount differs from approved amount → require re-approval of revised amount
    if (amountMismatch && ocr.amount != null) {
      pr.amount = ocr.amount;
      pr.status = 'pending';
      pr.approvedAmount = undefined;
      pr.approvedBy = undefined;
      pr.approvedAt = undefined;
      pr.screenshot = {
        name: file.name,
        url: file.url,
        mime: file.mime,
        size: file.size,
        hash,
      };
      pr.ocr = { ...ocr, mismatches };
      pr.flags = {
        noTransactionId: !txnId,
        amountMismatch: true,
        ocrUnclear: ocr.confidence === 'unclear',
        needsManualReview: true,
      };
      pr.noTransactionId = !txnId;
      if (txnId && txnUnique) pr.transactionId = txnId;
      pushHistory(
        pr,
        'amount_mismatch_reapproval',
        req.user!.id,
        `OCR amount ₹${ocr.amount} differs from approved — sent for owner re-approval`
      );
      if (pr.amountApproval) {
        await Approval.findByIdAndUpdate(pr.amountApproval, {
          status: 'rejected',
          reason: 'Superseded by OCR amount mismatch',
        }).catch(() => null);
      }
      await createAmountApproval(pr, req.user!.id, req.user!.email);
      await pr.save();
      return res.status(200).json({
        success: true,
        data: pr,
        meta: {
          requiresReapproval: true,
          mismatches,
          message: 'Paid amount differs from approved amount. Owner re-approval required before payment can be confirmed.',
        },
      });
    }

    // Soft block on hard mismatches / unclear / duplicate txn — stay unpaid (approved)
    const blocking =
      !txnUnique ||
      ocr.confidence === 'unclear' ||
      mismatches.some((m) => /Payee name|UPI ID|account details|Transaction ID already/i.test(m));

    pr.screenshot = {
      name: file.name,
      url: file.url,
      mime: file.mime,
      size: file.size,
      hash,
    };
    pr.ocr = { ...ocr, mismatches };
    pr.screenshotUploadedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
    pr.screenshotUploadedAt = new Date();
    pr.noTransactionId = !txnId;
    pr.flags = {
      noTransactionId: !txnId,
      amountMismatch: false,
      ocrUnclear: ocr.confidence === 'unclear',
      needsManualReview: blocking || !txnId || ocr.confidence === 'unclear',
    };
    if (txnId && txnUnique) pr.transactionId = txnId;

    pushHistory(
      pr,
      'screenshot_uploaded',
      req.user!.id,
      blocking
        ? `Screenshot uploaded with issues: ${mismatches.join('; ')}`
        : 'Screenshot uploaded — awaiting final owner approval'
    );

    if (blocking) {
      // Spec: remain unpaid; owner asked to check manually. Keep status approved (unpaid).
      await pr.save();
      return res.status(200).json({
        success: true,
        data: pr,
        meta: {
          awaitingManualReview: true,
          mismatches,
          message:
            mismatches.join('. ') ||
            'Screenshot could not be verified automatically. Request remains Unpaid for owner review.',
        },
      });
    }

    // OCR assist OK → still requires separate final owner approval (does NOT auto-mark Paid)
    pr.status = 'awaiting_final_approval';
    await createProofApproval(pr, req.user!.id, req.user!.email);
    await pr.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'upload',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });

    res.json({
      success: true,
      data: pr,
      meta: {
        awaitingFinalApproval: true,
        mismatches,
        noTransactionId: !txnId,
        message: 'Screenshot accepted for review. Owner final approval is required before marking Paid.',
      },
    });
  })
);

// POST /:id/approve-proof  (CEO — step 2 final)
router.post(
  '/:id/approve-proof',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const existing = await PaymentRequest.findById(req.params.id);
    if (!existing) throw new NotFoundError('Payment request not found');

    // Allow final approve from awaiting_final_approval OR approved with screenshot (manual path)
    if (
      existing.status !== 'awaiting_final_approval' &&
      !(existing.status === 'approved' && existing.screenshot?.url)
    ) {
      throw new AppError('No payment proof awaiting final approval', 400);
    }

    if (existing.status === 'approved' && existing.screenshot?.url) {
      existing.status = 'awaiting_final_approval';
      await existing.save();
    }

    const pr = await applyPaymentRequestProofDecision(paramId(req.params.id), true, req.user!.id);
    if (!pr) throw new NotFoundError('Payment request not found');

    if (pr.proofApproval) {
      await Approval.findByIdAndUpdate(pr.proofApproval, {
        $set: {
          status: 'approved',
          decidedBy: req.user!.id,
          decidedAt: new Date(),
        },
        $push: { history: { action: 'approved', by: req.user!.id, at: new Date() } },
      }).catch(() => null);
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'approve_proof',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });

    res.json({ success: true, data: pr });
  })
);

// POST /:id/dispute  (CEO — mark paid as disputed)
router.post(
  '/:id/dispute',
  requireRoles('ceo'),
  authorize('approvals', 'approve'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const pr = await PaymentRequest.findById(req.params.id);
    if (!pr) throw new NotFoundError('Payment request not found');
    if (pr.status !== 'paid') {
      throw new AppError('Only Paid requests can be marked as Disputed', 400);
    }
    pr.status = 'disputed';
    pr.disputedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
    pr.disputedAt = new Date();
    pr.disputeReason = reason;
    pushHistory(pr, 'disputed', req.user!.id, reason);
    await pr.save();

    await notifyUsers([String(pr.createdBy)], {
      type: 'payment_request',
      title: 'Payment request disputed',
      message: `Payment Request #${pr.requestNumber} was marked Disputed: ${reason}`,
      link: '/finance/payment-requests',
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'dispute',
      entity: 'PaymentRequest',
      entityId: pr._id.toString(),
      after: pr,
      req,
    });

    res.json({ success: true, data: pr });
  })
);

// POST /:id/transaction-id  (optional add later)
router.post(
  '/:id/transaction-id',
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    const { transactionId } = z
      .object({ transactionId: z.string().min(6).max(40) })
      .parse(req.body);
    const pr = await PaymentRequest.findById(req.params.id);
    if (!pr) throw new NotFoundError('Payment request not found');
    if (!['approved', 'awaiting_final_approval', 'paid', 'disputed'].includes(pr.status)) {
      throw new AppError('Cannot add transaction ID in current status', 400);
    }

    const txnId = transactionId.trim().toUpperCase();
    const duplicate = await PaymentRequest.findOne({
      _id: { $ne: pr._id },
      transactionId: txnId,
    })
      .select('requestNumber')
      .lean();
    if (duplicate) {
      throw new AppError(
        `Transaction ID already used on Payment Request #${duplicate.requestNumber}`,
        400
      );
    }

    pr.transactionId = txnId;
    pr.noTransactionId = false;
    pr.flags = { ...pr.flags, noTransactionId: false };
    pushHistory(pr, 'transaction_id_added', req.user!.id, `Txn/UTR set to ${txnId}`);
    await pr.save();
    res.json({ success: true, data: pr });
  })
);

// DELETE /:id — remove unpaid/rejected requests (Paid kept for finance integrity)
router.delete(
  '/:id',
  authorize('transactions', 'delete'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const pr = await PaymentRequest.findById(id);
    if (!pr) throw new NotFoundError('Payment request not found');

    if (pr.status === 'paid' || pr.transaction) {
      throw new AppError(
        'Paid payment requests cannot be deleted because they are linked to Finance. Mark as Disputed instead.',
        400
      );
    }

    const isOwner = ['ceo', 'finance'].includes(req.user!.role);
    const isCreator = String(pr.createdBy) === req.user!.id;
    if (!isOwner && !(isCreator && ['pending', 'rejected'].includes(pr.status))) {
      throw new ForbiddenError('You can only delete your own pending or rejected payment requests');
    }

    // CEO/finance may delete pending, approved, awaiting_final, rejected, disputed (without finance tx)
    if (isOwner && !['pending', 'approved', 'awaiting_final_approval', 'rejected', 'disputed'].includes(pr.status)) {
      throw new AppError('This payment request cannot be deleted in its current status', 400);
    }

    if (pr.amountApproval) {
      await Approval.findByIdAndDelete(pr.amountApproval).catch(() => null);
    }
    if (pr.proofApproval) {
      await Approval.findByIdAndDelete(pr.proofApproval).catch(() => null);
    }

    const before = pr.toObject();
    await PaymentRequest.findByIdAndDelete(pr._id);

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'PaymentRequest',
      entityId: id,
      before,
      req,
    });

    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
