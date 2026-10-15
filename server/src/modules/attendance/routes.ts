import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Attendance } from '../../models/Attendance.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { companyDateKey } from '../../utils/timezone.js';
import { paginate } from '../../utils/pagination.js';

const router = Router();
router.use(authenticate);

router.get(
  '/today',
  authorize('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const date = companyDateKey();
    const userId = req.user!.role === 'employee' ? req.user!.id : String(req.query.userId || req.user!.id);
    if (req.user!.role === 'employee' && userId !== req.user!.id) {
      throw new ForbiddenError();
    }
    const record = await Attendance.findOne({ user: userId, date }).lean();
    res.json({
      success: true,
      data: {
        date,
        record,
        // One attendance session per calendar day
        canCheckIn: !record?.checkInAt,
        canCheckOut: !!record?.checkInAt && !record?.checkOutAt,
        isCheckedIn: !!record?.checkInAt && !record?.checkOutAt,
      },
    });
  })
);

router.post(
  '/check-in',
  authorize('attendance', 'create'),
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'ceo') {
      throw new AppError('CEO / admin accounts do not use attendance check-in', 400, 'ATTENDANCE_EXEMPT');
    }
    const date = companyDateKey();
    const now = new Date();
    const existing = await Attendance.findOne({ user: req.user!.id, date });
    if (existing?.checkInAt && !existing.checkOutAt) {
      throw new AppError('Already checked in. Check out before starting a new session.', 400, 'ALREADY_CHECKED_IN');
    }
    // If already checked out today, reopen is not allowed (one session per day for simplicity)
    if (existing?.checkOutAt) {
      throw new AppError('Attendance already completed for today.', 400, 'DAY_COMPLETE');
    }

    const record = await Attendance.findOneAndUpdate(
      { user: req.user!.id, date },
      {
        user: req.user!.id,
        date,
        checkInAt: now,
        checkOutAt: undefined,
        durationMinutes: 0,
        status: 'checked_in',
        source: 'manual',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await writeAudit({
      actor: req.user!.id,
      action: 'check_in',
      entity: 'Attendance',
      entityId: record._id.toString(),
      after: { date, checkInAt: now },
      req,
    });

    res.status(201).json({ success: true, data: record });
  })
);

router.post(
  '/check-out',
  authorize('attendance', 'update'),
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'ceo') {
      throw new AppError('CEO / admin accounts do not use attendance check-out', 400, 'ATTENDANCE_EXEMPT');
    }
    const body = z
      .object({
        notes: z.string().max(4000).optional(),
        customTasks: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
        taskIds: z.array(z.string()).max(50).optional(),
      })
      .parse(req.body || {});

    const notes = body.notes?.trim() || '';
    const customTasks = (body.customTasks || []).map((t) => t.trim()).filter(Boolean);
    const taskIds = [...new Set(body.taskIds || [])];
    const effectiveNotes = notes || (customTasks.length || taskIds.length ? '' : 'Regular workday session completed.');

    const date = companyDateKey();
    const now = new Date();
    const record = await Attendance.findOne({ user: req.user!.id, date });
    if (!record?.checkInAt) {
      throw new AppError('No active check-in found for today.', 400, 'NOT_CHECKED_IN');
    }
    if (record.checkOutAt) {
      throw new AppError('Already checked out today.', 400, 'ALREADY_CHECKED_OUT');
    }

    const selectedTasks: { task: import('mongoose').Types.ObjectId; title: string }[] = [];
    if (taskIds.length) {
      const tasks = await Task.find({
        _id: { $in: taskIds },
        assignees: req.user!.id,
      })
        .select('title')
        .lean();
      if (tasks.length !== taskIds.length) {
        throw new AppError('One or more selected tasks are invalid or not assigned to you.', 400, 'INVALID_TASKS');
      }
      for (const t of tasks) {
        selectedTasks.push({ task: t._id as import('mongoose').Types.ObjectId, title: t.title });
      }
    }

    record.checkOutAt = now;
    record.durationMinutes = Math.max(1, Math.round((now.getTime() - record.checkInAt.getTime()) / 60000));
    record.status = 'checked_out';
    record.workLog = {
      notes: effectiveNotes || undefined,
      customTasks,
      selectedTasks,
      submittedAt: now,
    };
    await record.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'check_out',
      entity: 'Attendance',
      entityId: record._id.toString(),
      after: {
        date,
        checkOutAt: now,
        durationMinutes: record.durationMinutes,
        workLog: {
          notes: record.workLog?.notes,
          customTasks: record.workLog?.customTasks,
          selectedTasks: selectedTasks.map((t) => ({ task: String(t.task), title: t.title })),
        },
      },
      req,
    });

    const { notifyCeos } = await import('../../utils/notify.js');
    const taskCount = customTasks.length + selectedTasks.length;
    await notifyCeos({
      type: 'attendance',
      title: 'Employee checked out',
      message: `${req.user!.name || req.user!.email} checked out (${record.durationMinutes}m) with ${taskCount} work item(s)${notes ? `: ${notes.slice(0, 80)}` : ''}`,
      link: '/attendance',
      email: false,
    });

    res.json({ success: true, data: record });
  })
);

router.get(
  '/mine',
  authorize('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { user: req.user!.id };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) (filter.date as Record<string, string>).$gte = String(req.query.from);
      if (req.query.to) (filter.date as Record<string, string>).$lte = String(req.query.to);
    }
    const data = await paginate(Attendance, filter, req);
    res.json({ success: true, data });
  })
);

router.get(
  '/',
  authorize('attendance', 'manage'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.userId) filter.user = req.query.userId;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.date = filter.date || {};
      if (req.query.from) (filter.date as Record<string, string>).$gte = String(req.query.from);
      if (req.query.to) (filter.date as Record<string, string>).$lte = String(req.query.to);
    }
    const data = await paginate(Attendance, filter, req, 'user');
    res.json({ success: true, data });
  })
);

router.get(
  '/summary',
  authorize('attendance', 'manage'),
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || companyDateKey());
    const month = String(req.query.month || date.slice(0, 7));
    const [daily, monthly, checkedInNow, missingCheckout, presentToday] = await Promise.all([
      Attendance.aggregate([
        { $match: { date } },
        { $group: { _id: '$status', count: { $sum: 1 }, minutes: { $sum: '$durationMinutes' } } },
      ]),
      Attendance.aggregate([
        { $match: { date: { $regex: `^${month}` } } },
        {
          $group: {
            _id: '$user',
            days: { $sum: 1 },
            minutes: { $sum: '$durationMinutes' },
            missing: { $sum: { $cond: [{ $eq: ['$status', 'missing_checkout'] }, 1, 0] } },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $project: { name: '$user.name', email: '$user.email', days: 1, minutes: 1, missing: 1 } },
        { $sort: { minutes: -1 } },
        { $limit: 50 },
      ]),
      Attendance.countDocuments({ date, status: 'checked_in' }),
      Attendance.countDocuments({ date, status: 'missing_checkout' }),
      Attendance.countDocuments({ date, status: { $in: ['checked_in', 'checked_out', 'corrected'] } }),
    ]);

    const activeEmployees = await User.countDocuments({ status: 'active', role: { $ne: 'ceo' } });

    res.json({
      success: true,
      data: {
        date,
        month,
        activeEmployees,
        checkedInNow,
        presentToday,
        missingCheckout,
        daily,
        byEmployee: monthly,
      },
    });
  })
);

/** Aggregated workforce / employee activity heatmap for the specified year */
router.get(
  '/analytics/heatmap',
  authorize('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const canViewOthers = req.user!.role === 'ceo' || req.user!.role === 'manager' || req.user!.role === 'finance';
    const targetUserId = !canViewOthers
      ? req.user!.id
      : req.query.userId
        ? String(req.query.userId).trim()
        : undefined;

    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10) || new Date().getFullYear();
    const department = req.query.department ? String(req.query.department).trim() : undefined;

    const filter: Record<string, unknown> = {
      date: { $regex: `^${year}-` },
    };

    if (targetUserId) {
      if (!mongoose.isValidObjectId(targetUserId)) {
        throw new AppError('Invalid user ID', 400);
      }
      filter.user = new mongoose.Types.ObjectId(targetUserId);
    } else if (department) {
      const deptUsers = await User.find({ department, status: 'active' }).select('_id');
      filter.user = { $in: deptUsers.map((u) => u._id) };
    }

    const records = await Attendance.find(filter)
      .populate('user', 'name email avatar role department')
      .lean();

    const daysMap: Record<string, any> = {};
    let totalMinutes = 0;
    let missingCheckouts = 0;
    const activeDaysSet = new Set<string>();

    for (const r of records) {
      const d = r.date;
      if (!daysMap[d]) {
        daysMap[d] = {
          date: d,
          totalMinutes: 0,
          totalHours: 0,
          activeEmployees: 0,
          checkedInCount: 0,
          missingCheckoutCount: 0,
          workLogCount: 0,
          level: 0,
        };
      }
      const day = daysMap[d];
      let mins = r.durationMinutes || 0;
      if (r.status === 'checked_in' && r.checkInAt && !r.checkOutAt) {
        mins = Math.max(1, Math.round((Date.now() - new Date(r.checkInAt).getTime()) / 60000));
      }
      day.totalMinutes += mins;
      totalMinutes += mins;

      if (mins > 0 || r.status === 'checked_in' || r.status === 'checked_out') {
        day.activeEmployees += 1;
        activeDaysSet.add(d);
      }
      if (r.status === 'checked_in') day.checkedInCount += 1;
      if (r.status === 'missing_checkout') {
        day.missingCheckoutCount += 1;
        missingCheckouts += 1;
      }
      if (
        r.workLog &&
        ((r.workLog.customTasks && r.workLog.customTasks.length > 0) ||
          r.workLog.notes ||
          (r.workLog.selectedTasks && r.workLog.selectedTasks.length > 0))
      ) {
        day.workLogCount += 1;
      }

      if (targetUserId) {
        day.checkInAt = r.checkInAt;
        day.checkOutAt = r.checkOutAt;
        day.status = r.status;
        day.workLog = r.workLog;
        day.notes = r.notes;
        day.recordId = r._id;
      }
    }

    // Set intensity levels
    for (const d in daysMap) {
      const day = daysMap[d];
      day.totalHours = Math.round((day.totalMinutes / 60) * 10) / 10;
      const hours = day.totalMinutes / 60;
      if (targetUserId) {
        if (hours === 0 && day.status !== 'checked_in') day.level = 0;
        else if (hours < 2) day.level = 1;
        else if (hours < 4) day.level = 2;
        else if (hours < 6) day.level = 3;
        else day.level = 4;
      } else {
        if (hours === 0 && day.checkedInCount === 0) day.level = 0;
        else if (hours < 4) day.level = 1;
        else if (hours < 16) day.level = 2;
        else if (hours < 36) day.level = 3;
        else day.level = 4;
      }
    }

    const activeEmployeesCount = targetUserId
      ? 1
      : await User.countDocuments({
          status: 'active',
          role: { $ne: 'ceo' },
        });

    const activeDaysCount = activeDaysSet.size;
    const avgMinutesPerDay = activeDaysCount > 0 ? Math.round(totalMinutes / activeDaysCount) : 0;

    const monthlyStats: { month: string; monthIndex: number; minutes: number; hours: number; days: number }[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 0; m < 12; m++) {
      const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      let mMinutes = 0;
      let mDays = 0;
      for (const d in daysMap) {
        if (d.startsWith(monthPrefix)) {
          mMinutes += daysMap[d].totalMinutes;
          if (daysMap[d].totalMinutes > 0) mDays += 1;
        }
      }
      monthlyStats.push({
        month: monthNames[m],
        monthIndex: m,
        minutes: mMinutes,
        hours: Math.round((mMinutes / 60) * 10) / 10,
        days: mDays,
      });
    }

    const todayKey = companyDateKey();
    const presentTodayFilter: Record<string, unknown> = {
      date: todayKey,
      status: { $in: ['checked_in', 'checked_out', 'corrected'] },
    };
    const currentlyCheckedInFilter: Record<string, unknown> = {
      date: todayKey,
      status: 'checked_in',
    };
    if (targetUserId) {
      presentTodayFilter.user = new mongoose.Types.ObjectId(targetUserId);
      currentlyCheckedInFilter.user = new mongoose.Types.ObjectId(targetUserId);
    }

    const presentToday = await Attendance.countDocuments(presentTodayFilter);
    const currentlyCheckedIn = await Attendance.countDocuments(currentlyCheckedInFilter);

    const now = new Date();
    const isCurrentYear = now.getFullYear() === year;
    let expectedWorkingDays = 0;
    const cur = new Date(year, 0, 1);
    const end = isCurrentYear ? now : new Date(year, 11, 31);
    while (cur <= end) {
      const dayOfWeek = cur.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) expectedWorkingDays++;
      cur.setDate(cur.getDate() + 1);
    }
    const eligibleWorkers = targetUserId ? 1 : Math.max(1, activeEmployeesCount);
    const totalExpectedSlots = Math.max(1, expectedWorkingDays * eligibleWorkers);
    const totalAttendedSlots = records.filter(
      (r) => r.status === 'checked_in' || r.status === 'checked_out' || r.status === 'corrected'
    ).length;
    const attendanceRate = Math.min(100, Math.round((totalAttendedSlots / totalExpectedSlots) * 1000) / 10);

    res.json({
      success: true,
      data: {
        year,
        days: daysMap,
        summary: {
          totalLoggedMinutes: totalMinutes,
          totalLoggedHours: Math.round((totalMinutes / 60) * 10) / 10,
          activeWorkingDays: activeDaysCount,
          averageHoursPerDay: Math.round((avgMinutesPerDay / 60) * 10) / 10,
          missingCheckouts,
          attendanceRate,
          activeEmployeesCount,
          presentToday,
          currentlyCheckedIn,
        },
        monthlyStats,
      },
    });
  })
);

/** Employee Directory with attendance analytics & 14-day sparkline preview */
router.get(
  '/analytics/employee-directory',
  authorize('attendance', 'manage'),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const department = String(req.query.department || '').trim();
    const status = String(req.query.status || '').trim();
    const today = companyDateKey();

    const userFilter: Record<string, unknown> = {
      status: 'active',
      role: { $ne: 'ceo' },
    };
    if (search) {
      userFilter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { designation: new RegExp(search, 'i') },
      ];
    }
    if (department) {
      userFilter.department = department;
    }

    const users = await User.find(userFilter)
      .select('name email role department designation avatar employeeId')
      .sort({ name: 1 })
      .lean();

    const todayRecords = await Attendance.find({ date: today }).lean();
    const todayMap = new Map(todayRecords.map((r) => [String(r.user), r]));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromKey = companyDateKey(thirtyDaysAgo);

    const periodRecords = await Attendance.find({
      date: { $gte: fromKey, $lte: today },
    }).lean();

    const userRecordsMap = new Map<string, typeof periodRecords>();
    for (const r of periodRecords) {
      const uid = String(r.user);
      if (!userRecordsMap.has(uid)) userRecordsMap.set(uid, []);
      userRecordsMap.get(uid)!.push(r);
    }

    const recentDateKeys: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      recentDateKeys.push(companyDateKey(d));
    }

    const items = users.map((u) => {
      const uid = String(u._id);
      const todayRecord = todayMap.get(uid);
      const uRecords = userRecordsMap.get(uid) || [];

      let periodMinutes = 0;
      let activeDays = 0;
      let missingCheckouts = 0;

      for (const r of uRecords) {
        let mins = r.durationMinutes || 0;
        if (r.status === 'checked_in' && r.checkInAt && !r.checkOutAt) {
          mins = Math.max(1, Math.round((Date.now() - new Date(r.checkInAt).getTime()) / 60000));
        }
        periodMinutes += mins;
        if (mins > 0 || r.status === 'checked_in' || r.status === 'checked_out') {
          activeDays += 1;
        }
        if (r.status === 'missing_checkout') missingCheckouts += 1;
      }

      const dateToRecord = new Map(uRecords.map((r) => [r.date, r]));
      const recentSparkline = recentDateKeys.map((dk) => {
        const rec = dateToRecord.get(dk);
        let mins = rec?.durationMinutes || 0;
        if (rec?.status === 'checked_in' && rec?.checkInAt && !rec?.checkOutAt) {
          mins = Math.max(1, Math.round((Date.now() - new Date(rec.checkInAt).getTime()) / 60000));
        }
        let level = 0;
        if (mins > 0) {
          if (mins < 120) level = 1;
          else if (mins < 240) level = 2;
          else if (mins < 360) level = 3;
          else level = 4;
        }
        return {
          date: dk,
          minutes: mins,
          level,
          status: rec?.status || 'none',
        };
      });

      const todayStatus = todayRecord?.status || 'absent';
      let todayMinutes = todayRecord?.durationMinutes || 0;
      if (todayRecord?.status === 'checked_in' && todayRecord?.checkInAt && !todayRecord?.checkOutAt) {
        todayMinutes = Math.max(1, Math.round((Date.now() - new Date(todayRecord.checkInAt).getTime()) / 60000));
      }

      return {
        user: u,
        todayStatus,
        todayMinutes,
        todayCheckIn: todayRecord?.checkInAt,
        todayCheckOut: todayRecord?.checkOutAt,
        periodMinutes,
        periodHours: Math.round((periodMinutes / 60) * 10) / 10,
        activeDays,
        missingCheckouts,
        attendanceRate: Math.min(100, Math.round((activeDays / 22) * 100)),
        recentSparkline,
      };
    });

    let filteredItems = items;
    if (status) {
      if (status === 'checked_in') filteredItems = items.filter((i) => i.todayStatus === 'checked_in');
      else if (status === 'checked_out') filteredItems = items.filter((i) => i.todayStatus === 'checked_out');
      else if (status === 'absent') filteredItems = items.filter((i) => i.todayStatus === 'absent');
      else if (status === 'missing_checkout') filteredItems = items.filter((i) => i.todayStatus === 'missing_checkout');
    }

    res.json({ success: true, data: filteredItems });
  })
);

/** Day detail breakdown for modal / drawer inspection */
router.get(
  '/analytics/day-detail',
  authorize('attendance', 'read'),
  asyncHandler(async (req, res) => {
    const isManagerOrCeo = req.user!.role === 'ceo' || req.user!.role === 'manager';
    const date = String(req.query.date || companyDateKey()).trim();
    const filter: Record<string, unknown> = { date };

    if (!isManagerOrCeo) {
      filter.user = req.user!.id;
    } else if (req.query.userId) {
      filter.user = req.query.userId;
    }

    const records = await Attendance.find(filter)
      .populate('user', 'name email avatar role department designation employeeId')
      .sort({ checkInAt: 1 })
      .lean();

    res.json({ success: true, data: { date, records } });
  })
);

router.patch(
  '/:id/correct',
  requireRoles('ceo'),
  authorize('attendance', 'manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        checkInAt: z.coerce.date().optional(),
        checkOutAt: z.coerce.date().optional().nullable(),
        reason: z.string().min(3),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const record = await Attendance.findById(req.params.id);
    if (!record) throw new NotFoundError('Attendance not found');

    const before = record.toObject();
    if (body.checkInAt) record.checkInAt = body.checkInAt;
    if (body.checkOutAt !== undefined) {
      record.checkOutAt = body.checkOutAt || undefined;
    }
    if (record.checkInAt && record.checkOutAt) {
      record.durationMinutes = Math.max(
        1,
        Math.round((record.checkOutAt.getTime() - record.checkInAt.getTime()) / 60000)
      );
      record.status = 'corrected';
    } else if (record.checkInAt && !record.checkOutAt) {
      record.status = 'checked_in';
      record.durationMinutes = 0;
    }
    if (body.notes) record.notes = body.notes;
    record.corrections.push({
      by: req.user!.id as unknown as import('mongoose').Types.ObjectId,
      at: new Date(),
      reason: body.reason,
      before,
      after: {
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        durationMinutes: record.durationMinutes,
      },
    });
    record.source = 'correction';
    await record.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'attendance_correct',
      entity: 'Attendance',
      entityId: record._id.toString(),
      before,
      after: record,
      req,
    });

    res.json({ success: true, data: record });
  })
);

// Mark missing checkouts at end of day (callable by cron or CEO)
router.post(
  '/close-day',
  requireRoles('ceo'),
  asyncHandler(async (req, res) => {
    const date = String(req.body.date || companyDateKey());
    const result = await Attendance.updateMany(
      { date, checkInAt: { $ne: null }, checkOutAt: null, status: 'checked_in' },
      { status: 'missing_checkout' }
    );
    res.json({ success: true, data: { date, modified: result.modifiedCount } });
  })
);

export default router;
