import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Transaction } from '../../models/Transaction.js';
import { Invoice } from '../../models/Invoice.js';
import { Project } from '../../models/Project.js';
import { Task } from '../../models/Task.js';
import { Approval } from '../../models/Approval.js';
import { TimeLog } from '../../models/TimeLog.js';
import { Budget } from '../../models/Budget.js';
import { User } from '../../models/User.js';
import { Client } from '../../models/Client.js';
import { Lead } from '../../models/Lead.js';
import { Attendance } from '../../models/Attendance.js';
import { Conversation } from '../../models/Conversation.js';
import { roundMoney, pctSafe } from '../../utils/money.js';
import { companyDateKey } from '../../utils/timezone.js';
import { memoryCache } from '../../utils/cache.js';
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  format,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';

const router = Router();
router.use(authenticate);

function resolveRange(preset?: string, from?: string, to?: string) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), prevStart: startOfDay(subDays(now, 1)), prevEnd: endOfDay(subDays(now, 1)) };
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now), prevStart: startOfDay(subDays(now, 13)), prevEnd: endOfDay(subDays(now, 7)) };
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now), prevStart: startOfDay(subDays(now, 59)), prevEnd: endOfDay(subDays(now, 30)) };
    case 'quarter':
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        prevStart: startOfQuarter(subDays(startOfQuarter(now), 1)),
        prevEnd: endOfDay(subDays(startOfQuarter(now), 1)),
      };
    case 'year':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        prevStart: startOfYear(subDays(startOfYear(now), 1)),
        prevEnd: endOfYear(subDays(startOfYear(now), 1)),
      };
    case 'custom':
      return {
        start: startOfDay(new Date(from || subDays(now, 29))),
        end: endOfDay(new Date(to || now)),
        prevStart: startOfDay(subDays(new Date(from || subDays(now, 29)), 30)),
        prevEnd: endOfDay(subDays(new Date(from || subDays(now, 29)), 1)),
      };
    case 'month':
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        prevStart: startOfMonth(subDays(startOfMonth(now), 1)),
        prevEnd: endOfMonth(subDays(startOfMonth(now), 1)),
      };
  }
}

async function sumTx(type: 'revenue' | 'expense', start: Date, end: Date) {
  const r = await Transaction.aggregate([
    { $match: { type, status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return r[0]?.total || 0;
}

function pctChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

router.get(
  '/ceo',
  authorize('dashboard_ceo', 'read'),
  asyncHandler(async (req, res) => {
    const rangePreset = String(req.query.range || 'month');
    const cacheKey = `dashboard_ceo_${rangePreset}_${req.query.from || ''}_${req.query.to || ''}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const range = resolveRange(rangePreset, String(req.query.from || ''), String(req.query.to || ''));

    const now = new Date();
    const [
      revenue,
      expenses,
      prevRevenue,
      prevExpenses,
      outstanding,
      activeProjects,
      tasksCompleted,
      pendingApprovals,
      monthly,
      projects,
      budgets,
      teamStats,
      counts,
      recentTx,
      upcomingVendor,
      upcomingDeadlines,
      taskBreakdown,
      attCheckedIn,
      attExceptions,
      projectsCompleted,
      clientsNew,
      tasksPending,
      tasksOverdue,
    ] = await Promise.all([
      sumTx('revenue', range.start, range.end),
      sumTx('expense', range.start, range.end),
      sumTx('revenue', range.prevStart, range.prevEnd),
      sumTx('expense', range.prevStart, range.prevEnd),
      Invoice.aggregate([
        { $match: { status: { $in: ['sent', 'partially_paid', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$total', '$paid'] } } } },
      ]),
      Project.countDocuments({ status: 'active' }),
      Task.countDocuments({
        status: 'completed',
        completedAt: { $gte: range.start, $lte: range.end },
      }),
      Approval.find({ status: 'pending' })
        .sort({ priority: -1, amount: -1 })
        .limit(8)
        .populate('requestedBy', 'name email')
        .lean(),
      Transaction.aggregate([
        {
          $match: {
            status: { $in: ['approved', 'paid'] },
            date: { $gte: subDays(range.end, 365), $lte: range.end },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$date' }, m: { $month: '$date' }, type: '$type' },
            total: { $sum: '$amount' },
          },
        },
      ]),
      Project.find({ status: { $in: ['active', 'planned'] } })
        .populate('owner', 'name')
        .populate('client', 'name company')
        .sort('endDate')
        .limit(10)
        .lean(),
      Budget.find({ status: 'locked' }).lean(),
      Task.aggregate([
        {
          $facet: {
            completion: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            onTime: [
              { $match: { status: 'completed', dueDate: { $ne: null } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  onTime: {
                    $sum: {
                      $cond: [{ $lte: ['$completedAt', '$dueDate'] }, 1, 0],
                    },
                  },
                },
              },
            ],
            overdue: [
              {
                $match: {
                  status: { $ne: 'completed' },
                  dueDate: { $lt: new Date() },
                },
              },
              { $count: 'count' },
            ],
            topPerformers: [
              { $match: { status: 'completed', completedAt: { $gte: range.start, $lte: range.end } } },
              { $unwind: '$assignees' },
              { $group: { _id: '$assignees', completed: { $sum: 1 } } },
              {
                $lookup: {
                  from: 'users',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'user',
                },
              },
              { $unwind: '$user' },
              { $project: { name: '$user.name', completed: 1 } },
              { $sort: { completed: -1 } },
              { $limit: 5 },
            ],
          },
        },
      ]),
      Promise.all([
        User.countDocuments({ status: 'active' }),
        Client.countDocuments(),
        Client.countDocuments({ status: 'active' }),
        Lead.countDocuments({ stage: { $nin: ['won', 'lost'] } }),
        Task.countDocuments(),
        Approval.countDocuments({ status: 'pending' }),
      ]),
      Transaction.find({ status: { $in: ['approved', 'paid', 'pending'] } })
        .sort('-date')
        .limit(8)
        .populate('client', 'name company')
        .populate('vendor', 'name')
        .lean(),
      Transaction.find({
        type: 'expense',
        vendor: { $ne: null },
        status: { $in: ['approved', 'pending'] },
        date: { $gte: now, $lte: addDays(now, 30) },
      })
        .sort('date')
        .limit(8)
        .populate('vendor', 'name')
        .lean(),
      Task.find({
        status: { $ne: 'completed' },
        dueDate: { $gte: now, $lte: addDays(now, 14) },
      })
        .sort('dueDate')
        .limit(8)
        .populate('assignees', 'name')
        .lean(),
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Attendance.countDocuments({ date: companyDateKey(), status: 'checked_in' }),
      Attendance.countDocuments({
        date: companyDateKey(),
        status: { $in: ['missing_checkout'] },
      }),
      Project.countDocuments({ status: 'completed' }),
      Client.countDocuments({ createdAt: { $gte: range.start, $lte: range.end } }),
      Task.countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),
      Task.countDocuments({
        status: { $ne: 'completed' },
        dueDate: { $lt: now },
      }),
    ]);

    const [employees, clientsTotal, clientsActive, openLeads, tasksTotal, pendingApprovalCount] = counts;
    const checkedInNow = attCheckedIn;
    const attendanceExceptions = attExceptions;
    const completedProjects = projectsCompleted;
    const newClients = clientsNew;
    const pendingTasks = tasksPending;
    const overdueTasksCount = tasksOverdue;
    const netProfit = roundMoney(revenue - expenses);
    const margin = pctSafe(netProfit, revenue);
    const prevProfit = roundMoney(prevRevenue - prevExpenses);

    const months = eachMonthOfInterval({
      start: subDays(range.end, 365),
      end: range.end,
    }).slice(-12);

    const chart = months.map((m) => {
      const y = m.getFullYear();
      const mo = m.getMonth() + 1;
      const rev = monthly.find((x) => x._id.y === y && x._id.m === mo && x._id.type === 'revenue')?.total || 0;
      const exp = monthly.find((x) => x._id.y === y && x._id.m === mo && x._id.type === 'expense')?.total || 0;
      return { month: format(m, 'MMM yyyy'), revenue: rev, expenses: exp };
    });

    const budgetVariance = budgets.map((b) => ({
      name: b.name,
      category: b.category,
      planned: b.planned,
      actual: b.actual,
      variance: b.planned - b.actual,
    }));

    const stats = teamStats[0];
    const completedCount = stats.completion.find((c: { _id: string }) => c._id === 'completed')?.count || 0;
    const totalTasks = stats.completion.reduce((s: number, c: { count: number }) => s + c.count, 0);

    const dashboardPayload = {
      range: { start: range.start, end: range.end },
        kpis: {
          revenue: {
            value: revenue,
            change: pctChange(revenue, prevRevenue),
            sparkline: chart.map((c) => c.revenue),
            definition: 'collected (approved/paid revenue transactions)',
          },
          expenses: { value: expenses, change: pctChange(expenses, prevExpenses), sparkline: chart.map((c) => c.expenses) },
          netProfit: { value: netProfit, change: pctChange(netProfit, prevProfit), sparkline: chart.map((c) => c.revenue - c.expenses) },
          margin: { value: margin, change: pctChange(margin, pctSafe(prevProfit, prevRevenue)) },
          outstandingReceivables: { value: outstanding[0]?.total || 0 },
          activeProjects: { value: activeProjects },
          tasksCompleted: { value: tasksCompleted },
          pendingApprovals: { value: pendingApprovalCount },
          employees: { value: employees },
          clients: { value: clientsTotal },
          activeClients: { value: clientsActive },
          newClients: { value: newClients },
          openLeads: { value: openLeads },
          tasksTotal: { value: tasksTotal },
          pendingTasks: { value: pendingTasks },
          overdueTasks: { value: overdueTasksCount },
          completedProjects: { value: completedProjects },
          checkedInNow: { value: checkedInNow },
          attendanceExceptions: { value: attendanceExceptions },
        },
        taskBreakdown: Object.fromEntries(taskBreakdown.map((t: { _id: string; count: number }) => [t._id, t.count])),
        revenueVsExpenses: chart,
        budgetVariance,
        projects,
        recentTransactions: recentTx,
        upcomingVendorPayments: upcomingVendor,
        upcomingDeadlines,
        team: {
          completionRate: pctSafe(completedCount, totalTasks),
          onTimeRate: stats.onTime[0]
            ? pctSafe(stats.onTime[0].onTime, stats.onTime[0].total)
            : 0,
          overdue: stats.overdue[0]?.count || 0,
          topPerformers: stats.topPerformers,
        },
        pendingApprovals,
      };

      memoryCache.set(cacheKey, dashboardPayload, 20);
      res.json({ success: true, data: dashboardPayload });
    }
  )
);

router.get(
  '/employee',
  authorize('dashboard_employee', 'read'),
  asyncHandler(async (req, res) => {
    const cacheKey = `dashboard_employee_${req.user!.id}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const uid = new mongoose.Types.ObjectId(req.user!.id);
    const now = new Date();
    const tasks = await Task.find({ assignees: uid })
      .select('title status dueDate priority progress project')
      .populate('project', 'name')
      .sort('-updatedAt')
      .limit(100)
      .lean();

    const today = tasks.filter(
      (t) => t.dueDate && t.dueDate >= startOfDay(now) && t.dueDate <= endOfDay(now) && t.status !== 'completed'
    );
    const week = tasks.filter(
      (t) =>
        t.dueDate &&
        t.dueDate >= startOfWeek(now, { weekStartsOn: 1 }) &&
        t.dueDate <= endOfWeek(now, { weekStartsOn: 1 }) &&
        t.status !== 'completed'
    );
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'completed');
    const priority = tasks.filter((t) => ['high', 'urgent'].includes(t.priority) && t.status !== 'completed');

    const dateKey = companyDateKey();
    const [todayLogs, weekLogs, activeTimer, attendanceToday, attendanceHistory, recentChats, projects] =
      await Promise.all([
        TimeLog.aggregate([
          { $match: { user: uid, start: { $gte: startOfDay(now), $lte: endOfDay(now) } } },
          { $group: { _id: null, minutes: { $sum: '$minutes' } } },
        ]),
        TimeLog.aggregate([
          {
            $match: {
              user: uid,
              start: {
                $gte: startOfWeek(now, { weekStartsOn: 1 }),
                $lte: endOfWeek(now, { weekStartsOn: 1 }),
              },
            },
          },
          { $group: { _id: null, minutes: { $sum: '$minutes' } } },
        ]),
        TimeLog.findOne({ user: uid, end: null }).populate('task', 'title'),
        Attendance.findOne({ user: uid, date: dateKey }).lean(),
        Attendance.find({ user: uid }).sort({ date: -1 }).limit(14).lean(),
        Conversation.find({ members: uid })
          .sort({ lastMessageAt: -1 })
          .limit(5)
          .populate('members', 'name')
          .lean(),
        Project.find({ $or: [{ owner: uid }, { members: uid }] })
          .select('name status progress endDate')
          .limit(8)
          .lean(),
      ]);

    const attendanceMinutes =
      attendanceToday?.durationMinutes ||
      (attendanceToday?.checkInAt && !attendanceToday?.checkOutAt
        ? Math.max(0, Math.round((Date.now() - new Date(attendanceToday.checkInAt).getTime()) / 60000))
        : 0);

    const employeePayload = {
      tasks: { today, week, overdue, priority, all: tasks.slice(0, 50) },
      projects,
      attendance: {
        date: dateKey,
        today: attendanceToday,
        history: attendanceHistory,
        isCheckedIn: !!attendanceToday?.checkInAt && !attendanceToday?.checkOutAt,
        workMinutes: attendanceMinutes,
      },
      chat: recentChats,
      time: {
        todayMinutes: todayLogs[0]?.minutes || attendanceMinutes,
        weekMinutes: weekLogs[0]?.minutes || 0,
        activeTimer,
      },
      targets: {
        tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
        tasksTotal: tasks.length,
        progressAvg:
          tasks.length > 0
            ? tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length
            : 0,
      },
    };

    memoryCache.set(cacheKey, employeePayload, 20);
    res.json({ success: true, data: employeePayload });
  })
);

export default router;
