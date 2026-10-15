import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Transaction } from '../../models/Transaction.js';
import { Lead, LEAD_STAGES } from '../../models/Lead.js';
import { Client } from '../../models/Client.js';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';

const router = Router();
router.use(authenticate, authorize('analytics', 'read'));

router.get(
  '/revenue-growth',
  asyncHandler(async (req, res) => {
    const months = Number(req.query.months || 24);
    const start = startOfMonth(subMonths(new Date(), months - 1));
    const rows = await Transaction.aggregate([
      {
        $match: {
          type: 'revenue',
          status: { $in: ['approved', 'paid'] },
          date: { $gte: start },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$date' }, m: { $month: '$date' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]);

    const series = rows.map((r) => ({
      period: `${r._id.y}-${String(r._id.m).padStart(2, '0')}`,
      value: r.total,
    }));

    const withYoY = series.map((s) => {
      const [y, m] = s.period.split('-').map(Number);
      const prev = series.find((x) => x.period === `${y - 1}-${String(m).padStart(2, '0')}`);
      return {
        ...s,
        yoy: prev ? ((s.value - prev.value) / (prev.value || 1)) * 100 : null,
      };
    });

    res.json({ success: true, data: withYoY });
  })
);

router.get(
  '/profitability',
  asyncHandler(async (_req, res) => {
    const start = startOfMonth(subMonths(new Date(), 11));
    const rows = await Transaction.aggregate([
      {
        $match: {
          status: { $in: ['approved', 'paid'] },
          date: { $gte: start },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$date' }, m: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const map: Record<string, { revenue: number; expense: number }> = {};
    for (const r of rows) {
      const key = `${r._id.y}-${String(r._id.m).padStart(2, '0')}`;
      if (!map[key]) map[key] = { revenue: 0, expense: 0 };
      map[key][r._id.type as 'revenue' | 'expense'] = r.total;
    }

    const data = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({
        period,
        revenue: v.revenue,
        expense: v.expense,
        netProfit: v.revenue - v.expense,
        margin: v.revenue ? ((v.revenue - v.expense) / v.revenue) * 100 : 0,
      }));

    res.json({ success: true, data });
  })
);

router.get(
  '/pipeline',
  asyncHandler(async (_req, res) => {
    const rows = await Lead.aggregate([
      {
        $group: {
          _id: '$stage',
          count: { $sum: 1 },
          value: { $sum: '$value' },
        },
      },
    ]);
    const data = LEAD_STAGES.map((stage) => {
      const row = rows.find((r) => r._id === stage);
      return { stage, count: row?.count || 0, value: row?.value || 0 };
    });
    res.json({ success: true, data });
  })
);

router.get(
  '/conversion',
  asyncHandler(async (_req, res) => {
    const [overall, bySource, byOwner, byMonth] = await Promise.all([
      Lead.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
          },
        },
      ]),
      Lead.aggregate([
        {
          $group: {
            _id: '$source',
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
          },
        },
      ]),
      Lead.aggregate([
        {
          $group: {
            _id: '$owner',
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
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
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { name: '$user.name', total: 1, won: 1 } },
      ]),
      Lead.aggregate([
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
    ]);

    const o = overall[0] || { total: 0, won: 0 };
    res.json({
      success: true,
      data: {
        overall: { total: o.total, won: o.won, rate: o.total ? (o.won / o.total) * 100 : 0 },
        bySource: bySource.map((r) => ({
          source: r._id,
          total: r.total,
          won: r.won,
          rate: r.total ? (r.won / r.total) * 100 : 0,
        })),
        byOwner: byOwner.map((r) => ({
          owner: r.name || 'Unknown',
          total: r.total,
          won: r.won,
          rate: r.total ? (r.won / r.total) * 100 : 0,
        })),
        byMonth: byMonth.map((r) => ({
          period: `${r._id.y}-${String(r._id.m).padStart(2, '0')}`,
          total: r.total,
          won: r.won,
          rate: r.total ? (r.won / r.total) * 100 : 0,
        })),
      },
    });
  })
);

router.get(
  '/clients',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const [active, newClients, churned, revenuePerClient] = await Promise.all([
      Client.countDocuments({ status: 'active' }),
      Client.countDocuments({ status: 'active', onboardedAt: { $gte: monthStart } }),
      Client.countDocuments({ status: 'churned', updatedAt: { $gte: monthStart } }),
      Transaction.aggregate([
        { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] }, client: { $ne: null } } },
        { $group: { _id: '$client', revenue: { $sum: '$amount' } } },
        {
          $lookup: {
            from: 'clients',
            localField: '_id',
            foreignField: '_id',
            as: 'client',
          },
        },
        { $unwind: '$client' },
        { $project: { name: '$client.name', company: '$client.company', revenue: 1 } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalEver = await Client.countDocuments();
    const retention = totalEver ? ((active / totalEver) * 100) : 0;

    res.json({
      success: true,
      data: {
        active,
        newClients,
        churned,
        retention,
        topClients: revenuePerClient,
        asOf: format(endOfMonth(now), 'yyyy-MM-dd'),
      },
    });
  })
);

export default router;
