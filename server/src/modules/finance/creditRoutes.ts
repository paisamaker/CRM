import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { parsePagination } from '../../utils/pagination.js';
import { roundMoney, addMoney } from '../../utils/money.js';
import {
  CreditFacility,
  nextCreditFacilityNumber,
  CREDIT_KINDS,
  CREDIT_DIRECTIONS,
  CREDIT_FACILITY_STATUSES,
} from '../../models/CreditFacility.js';
import {
  CreditEntry,
  nextCreditEntryNumber,
  creditBalanceDelta,
  CREDIT_ENTRY_TYPES,
} from '../../models/CreditEntry.js';

/**
 * Credit / Loan ledger — completely separate from operating Transaction P&L.
 * These routes never create or update finance Transaction / Bill / BankAccount rows.
 */
const router = Router();
router.use(authenticate);
/** Credit & Loans: CEO (admin) and Manager only */
router.use(requireRoles('ceo', 'manager'));

function paramId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0] || '';
  return id || '';
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const facilityCreateSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(CREDIT_KINDS),
  direction: z.enum(CREDIT_DIRECTIONS),
  hasInterest: z.boolean(),
  partyName: z.string().min(1).max(200),
  principalAmount: z.coerce.number().min(0),
  interestRate: z.coerce.number().min(0).max(100).optional().nullable(),
  tenureMonths: z.coerce.number().min(0).optional().nullable(),
  emiAmount: z.coerce.number().min(0).optional().nullable(),
  processingFee: z.coerce.number().min(0).optional().nullable(),
  loanPurpose: z.string().max(500).optional().nullable(),
  collateral: z.string().max(500).optional().nullable(),
  lenderType: z.string().max(100).optional().nullable(),
  startDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** When true (default), records an initial disbursement for principalAmount > 0 */
  recordInitialDisbursement: z.boolean().optional().default(true),
});

const facilityUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  partyName: z.string().min(1).max(200).optional(),
  hasInterest: z.boolean().optional(),
  interestRate: z.coerce.number().min(0).max(100).optional().nullable(),
  tenureMonths: z.coerce.number().min(0).optional().nullable(),
  emiAmount: z.coerce.number().min(0).optional().nullable(),
  processingFee: z.coerce.number().min(0).optional().nullable(),
  loanPurpose: z.string().max(500).optional().nullable(),
  collateral: z.string().max(500).optional().nullable(),
  lenderType: z.string().max(100).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(CREDIT_FACILITY_STATUSES).optional(),
});

const entryCreateSchema = z.object({
  type: z.enum(CREDIT_ENTRY_TYPES),
  amount: z.coerce.number().positive(),
  adjustmentDirection: z.enum(['increase', 'decrease']).optional(),
  date: z.string().min(1),
  paymentMethod: z.string().max(100).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
});

/** Summary cards — credit ledger only */
router.get(
  '/summary',
  authorize('transactions', 'read'),
  asyncHandler(async (_req, res) => {
    const [agg] = await CreditFacility.aggregate([
      {
        $group: {
          _id: null,
          totalFacilities: { $sum: 1 },
          activeFacilities: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          creditOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$kind', 'credit'] }, 'loan'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          creditLentOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$kind', 'credit'] }, 'loan'] },
                    { $eq: ['$direction', 'lent'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          creditBorrowedOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$kind', 'credit'] }, 'loan'] },
                    { $eq: ['$direction', 'borrowed'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          loanOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $ifNull: ['$kind', 'credit'] }, 'loan'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          borrowedOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$direction', 'borrowed'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          lentOutstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$direction', 'lent'] },
                    { $ne: ['$status', 'closed'] },
                  ],
                },
                '$outstandingBalance',
                0,
              ],
            },
          },
          borrowedPrincipal: {
            $sum: {
              $cond: [{ $eq: ['$direction', 'borrowed'] }, '$principalAmount', 0],
            },
          },
          lentPrincipal: {
            $sum: {
              $cond: [{ $eq: ['$direction', 'lent'] }, '$principalAmount', 0],
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalFacilities: agg?.totalFacilities || 0,
        activeFacilities: agg?.activeFacilities || 0,
        creditOutstanding: roundMoney(agg?.creditOutstanding || 0),
        creditLentOutstanding: roundMoney(agg?.creditLentOutstanding || 0),
        creditBorrowedOutstanding: roundMoney(agg?.creditBorrowedOutstanding || 0),
        loanOutstanding: roundMoney(agg?.loanOutstanding || 0),
        borrowedOutstanding: roundMoney(agg?.borrowedOutstanding || 0),
        lentOutstanding: roundMoney(agg?.lentOutstanding || 0),
        borrowedPrincipal: roundMoney(agg?.borrowedPrincipal || 0),
        lentPrincipal: roundMoney(agg?.lentPrincipal || 0),
        /** Explicit: this ledger is excluded from operating P&L */
        excludedFromMainFinance: true,
      },
    });
  })
);

router.get(
  '/facilities',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req);
    const filter: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    if (req.query.kind && CREDIT_KINDS.includes(req.query.kind as never)) {
      if (req.query.kind === 'credit') {
        and.push({ $or: [{ kind: 'credit' }, { kind: { $exists: false } }, { kind: null }] });
      } else {
        filter.kind = req.query.kind;
      }
    }
    if (req.query.direction && CREDIT_DIRECTIONS.includes(req.query.direction as never)) {
      filter.direction = req.query.direction;
    }
    if (req.query.status && CREDIT_FACILITY_STATUSES.includes(req.query.status as never)) {
      filter.status = req.query.status;
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      const searchOr: Record<string, unknown>[] = [
        { title: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
      ];
      if (/^\d+$/.test(search)) {
        searchOr.push({ facilityNumber: Number(search) });
      }
      and.push({ $or: searchOr });
    }
    if (and.length) filter.$and = and;

    const [items, total] = await Promise.all([
      CreditFacility.find(filter)
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CreditFacility.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
    });
  })
);

router.get(
  '/facilities/:id',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const facility = await CreditFacility.findById(id)
      .populate('createdBy', 'name email')
      .lean();
    if (!facility) throw new NotFoundError('Credit facility not found');

    const entries = await CreditEntry.find({ facility: id })
      .populate('createdBy', 'name email')
      .sort({ date: -1, entryNumber: -1 })
      .lean();

    res.json({
      success: true,
      data: { facility, entries, excludedFromMainFinance: true },
    });
  })
);

router.post(
  '/facilities',
  authorize('transactions', 'create'),
  asyncHandler(async (req, res) => {
    const body = facilityCreateSchema.parse(req.body);
    const startDate = parseDate(body.startDate);
    if (!startDate) throw new AppError('Invalid start date', 400);
    const dueDate = body.dueDate ? parseDate(body.dueDate) : null;

    const principal = roundMoney(body.principalAmount);
    const facilityNumber = await nextCreditFacilityNumber();

    if (body.hasInterest && (body.interestRate == null || Number(body.interestRate) < 0)) {
      throw new AppError('Interest rate is required when interest is enabled', 400);
    }

    const facility = await CreditFacility.create({
      facilityNumber,
      title: body.title.trim(),
      kind: body.kind,
      direction: body.direction,
      hasInterest: body.hasInterest,
      partyName: body.partyName.trim(),
      principalAmount: principal,
      outstandingBalance: 0,
      interestRate: body.hasInterest ? (body.interestRate ?? undefined) : undefined,
      tenureMonths: body.tenureMonths ?? undefined,
      emiAmount: body.emiAmount ?? undefined,
      processingFee: body.processingFee ?? undefined,
      loanPurpose: body.loanPurpose || undefined,
      collateral: body.collateral || undefined,
      lenderType: body.lenderType || undefined,
      startDate,
      dueDate: dueDate || undefined,
      status: 'active',
      paymentMethod: body.paymentMethod || undefined,
      reference: body.reference || undefined,
      notes: body.notes || undefined,
      createdBy: req.user!.id,
    });

    if (body.recordInitialDisbursement && principal > 0) {
      const entryNumber = await nextCreditEntryNumber(String(facility._id));
      const balanceAfter = roundMoney(principal);
      await CreditEntry.create({
        facility: facility._id,
        entryNumber,
        type: 'disbursement',
        amount: principal,
        date: startDate,
        paymentMethod: body.paymentMethod || undefined,
        note: 'Initial disbursement',
        balanceAfter,
        createdBy: req.user!.id,
      });
      facility.outstandingBalance = balanceAfter;
      await facility.save();
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'CreditFacility',
      entityId: String(facility._id),
      after: facility,
      req,
    });

    res.status(201).json({
      success: true,
      data: facility,
      message: 'Credit facility created (separate from main finance ledger)',
    });
  })
);

router.patch(
  '/facilities/:id',
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const body = facilityUpdateSchema.parse(req.body);
    const facility = await CreditFacility.findById(id);
    if (!facility) throw new NotFoundError('Credit facility not found');

    if (body.title !== undefined) facility.title = body.title.trim();
    if (body.partyName !== undefined) facility.partyName = body.partyName.trim();
    if (body.hasInterest !== undefined) facility.hasInterest = body.hasInterest;
    if (body.interestRate !== undefined) {
      facility.interestRate = body.hasInterest === false ? undefined : body.interestRate ?? undefined;
    }
    if (body.hasInterest === false) facility.interestRate = undefined;
    if (body.tenureMonths !== undefined) facility.tenureMonths = body.tenureMonths ?? undefined;
    if (body.emiAmount !== undefined) facility.emiAmount = body.emiAmount ?? undefined;
    if (body.processingFee !== undefined) facility.processingFee = body.processingFee ?? undefined;
    if (body.loanPurpose !== undefined) facility.loanPurpose = body.loanPurpose || undefined;
    if (body.collateral !== undefined) facility.collateral = body.collateral || undefined;
    if (body.lenderType !== undefined) facility.lenderType = body.lenderType || undefined;
    if (body.dueDate !== undefined) {
      facility.dueDate = body.dueDate ? parseDate(body.dueDate) || undefined : undefined;
    }
    if (body.paymentMethod !== undefined) {
      facility.paymentMethod = body.paymentMethod || undefined;
    }
    if (body.reference !== undefined) facility.reference = body.reference || undefined;
    if (body.notes !== undefined) facility.notes = body.notes || undefined;
    if (body.status !== undefined) {
      facility.status = body.status;
      if (body.status === 'closed') facility.closedAt = new Date();
      if (body.status === 'active') facility.closedAt = undefined;
    }

    await facility.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'CreditFacility',
      entityId: id,
      after: facility,
      req,
    });

    res.json({ success: true, data: facility });
  })
);

router.post(
  '/facilities/:id/close',
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const facility = await CreditFacility.findById(id);
    if (!facility) throw new NotFoundError('Credit facility not found');
    const force = !!req.body?.force;
    if (!force && roundMoney(facility.outstandingBalance) > 0) {
      throw new AppError(
        'Outstanding balance must be zero to close. Settle repayments first, or pass force=true.',
        400
      );
    }
    facility.status = 'closed';
    facility.closedAt = new Date();
    await facility.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'close',
      entity: 'CreditFacility',
      entityId: id,
      after: { force, balance: facility.outstandingBalance },
      req,
    });
    res.json({ success: true, data: facility });
  })
);

router.post(
  '/facilities/:id/entries',
  authorize('transactions', 'create'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const body = entryCreateSchema.parse(req.body);
    const facility = await CreditFacility.findById(id);
    if (!facility) throw new NotFoundError('Credit facility not found');
    if (facility.status === 'closed') {
      throw new AppError('Cannot post entries on a closed facility', 400);
    }
    if (body.type === 'adjustment' && !body.adjustmentDirection) {
      throw new AppError('adjustmentDirection is required for adjustments', 400);
    }

    const date = parseDate(body.date);
    if (!date) throw new AppError('Invalid entry date', 400);

    const amount = roundMoney(body.amount);
    const delta = creditBalanceDelta(body.type, amount, body.adjustmentDirection);
    const nextBalance = roundMoney(addMoney(facility.outstandingBalance, delta));
    if (nextBalance < 0) {
      throw new AppError(
        `This entry would make outstanding negative (current ${facility.outstandingBalance}).`,
        400
      );
    }

    const entryNumber = await nextCreditEntryNumber(id);
    const entry = await CreditEntry.create({
      facility: facility._id,
      entryNumber,
      type: body.type,
      amount,
      adjustmentDirection: body.type === 'adjustment' ? body.adjustmentDirection : undefined,
      date,
      paymentMethod: body.paymentMethod || undefined,
      note: body.note || undefined,
      reference: body.reference || undefined,
      balanceAfter: nextBalance,
      createdBy: req.user!.id,
    });

    facility.outstandingBalance = nextBalance;
    if (nextBalance === 0 && body.type === 'repayment') {
      // keep active unless user closes — just update balance
    }
    await facility.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'CreditEntry',
      entityId: String(entry._id),
      after: { facilityId: id, type: body.type, amount, balanceAfter: nextBalance },
      req,
    });

    res.status(201).json({
      success: true,
      data: { entry, facility },
      message: 'Credit entry recorded (not counted in main finance)',
    });
  })
);

router.delete(
  '/facilities/:id/entries/:entryId',
  authorize('transactions', 'delete'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const entryId = paramId(req.params.entryId);
    const facility = await CreditFacility.findById(id);
    if (!facility) throw new NotFoundError('Credit facility not found');

    const entry = await CreditEntry.findOne({ _id: entryId, facility: id });
    if (!entry) throw new NotFoundError('Credit entry not found');

    // Only allow deleting the latest entry to keep balance chain consistent
    const latest = await CreditEntry.findOne({ facility: id })
      .sort({ entryNumber: -1 })
      .select('_id entryNumber')
      .lean();
    if (!latest || String(latest._id) !== String(entry._id)) {
      throw new AppError('Only the most recent entry can be deleted', 400);
    }

    const delta = creditBalanceDelta(entry.type, entry.amount, entry.adjustmentDirection);
    const nextBalance = roundMoney(addMoney(facility.outstandingBalance, -delta));
    if (nextBalance < 0) {
      throw new AppError('Reversing this entry would produce a negative balance', 400);
    }

    await entry.deleteOne();
    facility.outstandingBalance = nextBalance;
    await facility.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'CreditEntry',
      entityId: entryId,
      after: { facilityId: id, reversedDelta: delta, balanceAfter: nextBalance },
      req,
    });

    res.json({ success: true, data: { facility }, message: 'Entry removed' });
  })
);

router.delete(
  '/facilities/:id',
  authorize('transactions', 'delete'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const facility = await CreditFacility.findById(id);
    if (!facility) throw new NotFoundError('Credit facility not found');

    const entryCount = await CreditEntry.countDocuments({ facility: id });
    if (entryCount > 0 && !req.query.force) {
      throw new AppError(
        'Facility has ledger entries. Close it instead, or pass ?force=true to delete all credit entries.',
        400
      );
    }

    await CreditEntry.deleteMany({ facility: id });
    await facility.deleteOne();

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'CreditFacility',
      entityId: id,
      after: { entryCount },
      req,
    });

    res.json({ success: true, message: 'Credit facility deleted' });
  })
);

export default router;
