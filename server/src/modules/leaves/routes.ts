import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { notifyCeos, notifyUsers } from '../../utils/notify.js';
import { LeaveRequest, LEAVE_TYPES } from '../../models/LeaveRequest.js';
import { Attendance } from '../../models/Attendance.js';
import { User } from '../../models/User.js';
import { getSettings } from '../../models/Settings.js';
import {
  holidayMapForYear,
  isExpectedWorkDay,
  parseDateKey,
  toDateKey,
} from '../../utils/workCalendar.js';
import { paginate } from '../../utils/pagination.js';

const router = Router();
router.use(authenticate);

function paramId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0] || '';
  return id || '';
}

function isYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function eachDateKey(start: string, end: string): string[] {
  const keys: string[] = [];
  const cur = parseDateKey(start);
  const last = parseDateKey(end);
  while (cur <= last) {
    keys.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

async function applyLeaveToAttendance(opts: {
  userId: string;
  startDate: string;
  endDate: string;
  leaveId: string;
  type: string;
}) {
  const years = new Set(
    eachDateKey(opts.startDate, opts.endDate).map((k) => Number(k.slice(0, 4)))
  );
  const settings = await getSettings();
  const holidayMaps = new Map<number, Map<string, string>>();
  for (const y of years) {
    holidayMaps.set(y, holidayMapForYear(settings.companyHolidays || [], y));
  }

  const marked: string[] = [];
  for (const date of eachDateKey(opts.startDate, opts.endDate)) {
    const year = Number(date.slice(0, 4));
    const holidayMap = holidayMaps.get(year) || new Map();
    // Still mark leave on work days; skip company holidays (already off for everyone)
    if (!isExpectedWorkDay(parseDateKey(date), holidayMap)) continue;

    const existing = await Attendance.findOne({ user: opts.userId, date });
    if (
      existing &&
      ['checked_in', 'checked_out', 'corrected', 'missing_checkout'].includes(existing.status)
    ) {
      // Don't wipe real work — only annotate notes
      existing.notes = [existing.notes, `Leave approved (${opts.type})`].filter(Boolean).join(' · ');
      await existing.save();
      continue;
    }

    await Attendance.findOneAndUpdate(
      { user: opts.userId, date },
      {
        user: opts.userId,
        date,
        status: 'on_leave',
        durationMinutes: 0,
        source: 'system',
        notes: `Approved leave (${opts.type}) · ${opts.leaveId}`,
        checkInAt: undefined,
        checkOutAt: undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    marked.push(date);
  }
  return marked;
}

async function clearLeaveAttendance(opts: {
  userId: string;
  startDate: string;
  endDate: string;
  leaveId: string;
}) {
  const result = await Attendance.deleteMany({
    user: opts.userId,
    date: { $gte: opts.startDate, $lte: opts.endDate },
    status: 'on_leave',
    notes: { $regex: opts.leaveId },
  });
  return result.deletedCount || 0;
}

const createSchema = z.object({
  type: z.enum(LEAVE_TYPES).default('casual'),
  startDate: z.string().refine(isYmd, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().refine(isYmd, 'endDate must be YYYY-MM-DD').optional(),
  reason: z.string().trim().min(3).max(2000),
});

/** List leave requests — CEO sees all; others see own */
router.get(
  '/',
  authorize('leaves', 'read'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    const filter: Record<string, unknown> = {};
    if (req.user!.role !== 'ceo') {
      filter.user = req.user!.id;
    } else if (req.query.userId && mongoose.isValidObjectId(String(req.query.userId))) {
      filter.user = String(req.query.userId);
    }
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const data = await paginate(LeaveRequest, filter, req, ['user', 'decidedBy']);

    const pendingCount =
      req.user!.role === 'ceo'
        ? await LeaveRequest.countDocuments({ status: 'pending' })
        : await LeaveRequest.countDocuments({ user: req.user!.id, status: 'pending' });

    res.json({ success: true, data: { ...data, pendingCount } });
  })
);

router.get(
  '/pending-count',
  authorize('leaves', 'read'),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ceo') {
      res.json({ success: true, data: { count: 0 } });
      return;
    }
    const count = await LeaveRequest.countDocuments({ status: 'pending' });
    res.json({ success: true, data: { count } });
  })
);

router.post(
  '/',
  authorize('leaves', 'create'),
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'ceo') {
      throw new ForbiddenError('CEO accounts do not submit leave applications');
    }

    const body = createSchema.parse(req.body);
    const startDate = body.startDate;
    const endDate = body.endDate || body.startDate;
    if (endDate < startDate) {
      throw new AppError('End date cannot be before start date', 400);
    }

    const settings = await getSettings();
    const years = new Set(
      eachDateKey(startDate, endDate).map((k) => Number(k.slice(0, 4)))
    );
    let days = 0;
    for (const y of years) {
      const map = holidayMapForYear(settings.companyHolidays || [], y);
      for (const key of eachDateKey(startDate, endDate)) {
        if (Number(key.slice(0, 4)) !== y) continue;
        if (isExpectedWorkDay(parseDateKey(key), map)) days += 1;
      }
    }
    days = Math.max(1, days);

    // Overlap with pending/approved leave
    const overlap = await LeaveRequest.findOne({
      user: req.user!.id,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    if (overlap) {
      throw new AppError('You already have a leave request overlapping these dates', 400);
    }

    const leave = await LeaveRequest.create({
      user: req.user!.id,
      type: body.type,
      startDate,
      endDate,
      days,
      reason: body.reason.trim(),
      status: 'pending',
    });

    const populated = await LeaveRequest.findById(leave._id).populate(
      'user',
      'name email avatar role department designation'
    );

    const requester = await User.findById(req.user!.id).select('name').lean();
    await notifyCeos({
      type: 'leave',
      title: 'Leave application',
      message: `${requester?.name || 'An employee'} requested ${days} day${days > 1 ? 's' : ''} leave (${startDate}${endDate !== startDate ? ` → ${endDate}` : ''})`,
      link: '/leaves',
      meta: { leaveId: String(leave._id) },
      email: false,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'LeaveRequest',
      entityId: String(leave._id),
      after: { startDate, endDate, days, type: body.type },
      req,
    });

    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/:id/approve',
  requireRoles('ceo'),
  authorize('leaves', 'approve'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const note = z.string().max(1000).optional().parse(req.body?.note);
    const leave = await LeaveRequest.findById(id);
    if (!leave) throw new NotFoundError('Leave request not found');
    if (leave.status !== 'pending') {
      throw new AppError('Only pending leave can be approved', 400);
    }

    leave.status = 'approved';
    leave.decidedBy = req.user!.id as unknown as mongoose.Types.ObjectId;
    leave.decidedAt = new Date();
    leave.decisionNote = note || undefined;
    await leave.save();

    const marked = await applyLeaveToAttendance({
      userId: String(leave.user),
      startDate: leave.startDate,
      endDate: leave.endDate,
      leaveId: String(leave._id),
      type: leave.type,
    });

    await notifyUsers([String(leave.user)], {
      type: 'leave',
      title: 'Leave approved',
      message: `Your leave (${leave.startDate}${leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}) was approved by the CEO.`,
      link: '/leaves',
      meta: { leaveId: String(leave._id), status: 'approved' },
      email: false,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'approve',
      entity: 'LeaveRequest',
      entityId: id,
      after: { status: 'approved', markedDays: marked.length },
      req,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate('user', 'name email avatar role department designation')
      .populate('decidedBy', 'name email avatar role');

    res.json({ success: true, data: populated, meta: { markedDays: marked } });
  })
);

router.post(
  '/:id/reject',
  requireRoles('ceo'),
  authorize('leaves', 'approve'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const body = z
      .object({ reason: z.string().trim().min(2).max(1000).optional() })
      .parse(req.body || {});
    const leave = await LeaveRequest.findById(id);
    if (!leave) throw new NotFoundError('Leave request not found');
    if (leave.status !== 'pending') {
      throw new AppError('Only pending leave can be rejected', 400);
    }

    leave.status = 'rejected';
    leave.decidedBy = req.user!.id as unknown as mongoose.Types.ObjectId;
    leave.decidedAt = new Date();
    leave.decisionNote = body.reason || undefined;
    await leave.save();

    await notifyUsers([String(leave.user)], {
      type: 'leave',
      title: 'Leave declined',
      message: `Your leave (${leave.startDate}${leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}) was declined.${
        body.reason ? ` Reason: ${body.reason}` : ''
      }`,
      link: '/leaves',
      meta: { leaveId: String(leave._id), status: 'rejected' },
      email: false,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'reject',
      entity: 'LeaveRequest',
      entityId: id,
      after: { status: 'rejected', decisionNote: body.reason },
      req,
    });

    const populated = await LeaveRequest.findById(leave._id)
      .populate('user', 'name email avatar role department designation')
      .populate('decidedBy', 'name email avatar role');

    res.json({ success: true, data: populated });
  })
);

/** Employee cancels a pending request */
router.post(
  '/:id/cancel',
  authorize('leaves', 'create'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const leave = await LeaveRequest.findById(id);
    if (!leave) throw new NotFoundError('Leave request not found');
    if (String(leave.user) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError();
    }
    if (leave.status !== 'pending') {
      throw new AppError('Only pending leave can be cancelled', 400);
    }
    leave.status = 'cancelled';
    leave.decidedAt = new Date();
    leave.decidedBy = req.user!.id as unknown as mongoose.Types.ObjectId;
    await leave.save();

    res.json({ success: true, data: leave });
  })
);

/** CEO can revoke an approved leave (clears attendance leave marks) */
router.post(
  '/:id/revoke',
  requireRoles('ceo'),
  authorize('leaves', 'approve'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const leave = await LeaveRequest.findById(id);
    if (!leave) throw new NotFoundError('Leave request not found');
    if (leave.status !== 'approved') {
      throw new AppError('Only approved leave can be revoked', 400);
    }

    const cleared = await clearLeaveAttendance({
      userId: String(leave.user),
      startDate: leave.startDate,
      endDate: leave.endDate,
      leaveId: String(leave._id),
    });

    leave.status = 'cancelled';
    leave.decidedBy = req.user!.id as unknown as mongoose.Types.ObjectId;
    leave.decidedAt = new Date();
    leave.decisionNote = 'Revoked by CEO';
    await leave.save();

    await notifyUsers([String(leave.user)], {
      type: 'leave',
      title: 'Leave revoked',
      message: `Your approved leave (${leave.startDate}${leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}) was revoked.`,
      link: '/leaves',
      meta: { leaveId: String(leave._id), status: 'cancelled' },
      email: false,
    });

    res.json({ success: true, data: leave, meta: { cleared } });
  })
);

export default router;
