import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  format,
  subDays,
  subMonths,
  startOfYear,
} from 'date-fns';
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Wallet,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  ChevronRight,
  ChevronLeft,
  Filter,
  DollarSign,
  Layers,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  Receipt,
  Users,
  Copy,
  ExternalLink,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatPercent, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Card';

// ── Types ───────────────────────────────────────────────────────────────────

interface OverviewData {
  revenue: {
    today: number;
    month: number;
    year: number;
    cumulative: number;
    definition?: string;
  };
  invoiced: {
    month: number;
    collectedMonth: number;
    definition?: string;
  };
  expenses: {
    month: number;
    year: number;
    byCategory: Array<{ _id: string; total: number }>;
  };
  profit: {
    month: number;
    margin: number;
    year: number;
    definition?: string;
  };
  ar: {
    outstanding: number;
    aging: {
      '0-30': { count: number; amount: number };
      '31-60': { count: number; amount: number };
      '61-90': { count: number; amount: number };
      '90+': { count: number; amount: number };
    };
    overdue: Array<{
      _id: string;
      number?: string;
      outstanding: number;
      dueDate: string;
      status: string;
      client?: { name?: string; company?: string };
    }>;
  };
  vendorPayables: {
    outstanding: number;
    count: number;
    upcoming: Array<{
      _id: string;
      amount: number;
      date: string;
      status?: string;
      vendor?: { name?: string };
    }>;
  };
  payrollLiability: number;
  treasury: {
    accounts: Array<{
      _id: string;
      name: string;
      bank: string;
      balance: number;
      accountLast4: string;
    }>;
    totalLiquid: number;
  };
}

interface PnlSummaryItem {
  period: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
}

interface TransactionItem {
  _id: string;
  date: string;
  type: 'revenue' | 'expense';
  category: string;
  amount: number;
  status: string;
  notes?: string;
  title?: string;
  paymentMethod?: string;
  client?: { _id?: string; name?: string; company?: string };
  vendor?: { _id?: string; name?: string };
  project?: { _id?: string; name?: string };
  createdBy?: { name?: string; email?: string };
}

const EXPENSE_PALETTE = [
  '#0D9488', // Teal
  '#8B5CF6', // Violet
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#F43F5E', // Rose
  '#06B6D4', // Cyan
  '#64748B', // Slate
];

const TIME_RANGES = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '12m', label: '12M' },
  { id: 'ytd', label: 'YTD' },
];

export function FinanceOverviewPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState('30d');
  const [compareMode, setCompareMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Transactions widget state
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'revenue' | 'expense'>('all');
  const [txStatusFilter, setTxStatusFilter] = useState<string>('all');
  const [txPage, setTxPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  // Interactive donut hover
  const [hoveredExpenseIndex, setHoveredExpenseIndex] = useState<number | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────

  const overviewQuery = useQuery({
    queryKey: ['finance-overview'],
    queryFn: async () => (await api.get('/finance/overview')).data.data as OverviewData,
    staleTime: 60 * 1000,
  });

  const rangeParams = useMemo(() => {
    const end = new Date();
    let start: Date;
    if (range === '7d') start = subDays(end, 7);
    else if (range === '30d') start = subMonths(end, 1);
    else if (range === '90d') start = subMonths(end, 3);
    else if (range === 'ytd') start = startOfYear(end);
    else start = subMonths(end, 11);
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    };
  }, [range]);

  const pnlQuery = useQuery({
    queryKey: ['finance-pnl', rangeParams.from, rangeParams.to],
    queryFn: async () =>
      (await api.get('/finance/pnl', { params: rangeParams })).data.data as {
        summary: PnlSummaryItem[];
      },
    staleTime: 60 * 1000,
  });

  const transactionsQuery = useQuery({
    queryKey: ['finance-transactions-overview', txTypeFilter, txStatusFilter, txPage],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 8, page: txPage };
      if (txTypeFilter !== 'all') params.type = txTypeFilter;
      if (txStatusFilter !== 'all') params.status = txStatusFilter;
      const res = await api.get('/finance/transactions', { params });
      return res.data.data as {
        items: TransactionItem[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
    },
    staleTime: 30 * 1000,
  });

  const data = overviewQuery.data;

  // Filter transactions in memory if user typed a search query
  const filteredTransactions = useMemo(() => {
    const items = transactionsQuery.data?.items || [];
    if (!txSearch.trim()) return items;
    const q = txSearch.toLowerCase();
    return items.filter(
      (t) =>
        t.category?.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q) ||
        t.client?.name?.toLowerCase().includes(q) ||
        t.client?.company?.toLowerCase().includes(q) ||
        t.vendor?.name?.toLowerCase().includes(q)
    );
  }, [transactionsQuery.data?.items, txSearch]);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['finance-overview'] }),
      qc.invalidateQueries({ queryKey: ['finance-pnl'] }),
      qc.invalidateQueries({ queryKey: ['finance-transactions-overview'] }),
    ]);
    setLastRefreshed(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
    toast.success('Financial ledger updated');
  }

  async function exportFile(fileFormat: 'csv' | 'pdf') {
    setExporting(true);
    try {
      const res = await api.get('/finance/export', {
        params: { format: fileFormat, ...rangeParams },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `starmedia-finance-export-${format(new Date(), 'yyyy-MM-dd')}.${fileFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported finance ledger as ${fileFormat.toUpperCase()}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  // ── Loading Skeleton ────────────────────────────────────────────────────

  if (overviewQuery.isLoading || !data) {
    return (
      <div className="space-y-6 p-1 sm:p-2 bg-[#F7F8FA] min-h-screen">
        <div className="h-16 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8 h-80 animate-pulse rounded-2xl bg-white border border-slate-200" />
          <div className="lg:col-span-4 h-80 animate-pulse rounded-2xl bg-white border border-slate-200" />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-white border border-slate-200" />
        </div>
      </div>
    );
  }

  // ── Financial Calculations ──────────────────────────────────────────────

  const collectionRate =
    data.invoiced.month > 0
      ? Math.min(100, Math.round((data.invoiced.collectedMonth / data.invoiced.month) * 100))
      : 100;

  const totalExpenseSum = (data.expenses.byCategory || []).reduce((acc, c) => acc + c.total, 0);

  const agingBuckets = data.ar.aging || {
    '0-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 },
    '90+': { count: 0, amount: 0 },
  };

  const totalArAmount = Math.max(1, data.ar.outstanding || 0);

  const chartPnlSummary = pnlQuery.data?.summary || [
    { period: 'Current', revenue: data.revenue.month, expense: data.expenses.month, profit: data.profit.month, margin: data.profit.margin },
  ];

  return (
    <div className="min-h-screen space-y-6 bg-[#F7F8FA] text-[#151922] font-sans pb-12">
      {/* ── SECTION A: FINANCIAL SUMMARY / HEADER ────────────────────────── */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-[#747B8C]">
              <span>Finance</span>
              <span>/</span>
              <span className="font-semibold text-teal-700">Overview</span>
              <span className="mx-1 text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Ledger Sync
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
              <h1 className="text-xl font-bold tracking-tight text-[#151922] sm:text-2xl">
                Financial Overview
              </h1>
              <span className="text-xs text-[#747B8C]">
                Updated {format(lastRefreshed, 'hh:mm a')}
              </span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Time Filter Tabs */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/90 p-0.5 text-xs font-semibold shadow-2xs">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-all',
                    range === r.id
                      ? 'bg-white text-[#151922] font-bold shadow-xs'
                      : 'text-[#747B8C] hover:text-[#151922]'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Compare Toggle */}
            <button
              type="button"
              onClick={() => setCompareMode(!compareMode)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shadow-2xs',
                compareMode
                  ? 'border-teal-500 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              <span>Compare Overheads</span>
            </button>

            {/* Refresh Data Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 active:scale-95 transition shadow-2xs disabled:opacity-50"
              title="Refresh financial data"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin text-teal-600')} />
            </button>

            {/* Export Actions */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => exportFile('csv')}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-teal-600" />
                <span>CSV</span>
              </button>
              <span className="h-3.5 w-[1px] bg-slate-200" />
              <button
                type="button"
                onClick={() => exportFile('pdf')}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                <FileText className="h-3.5 w-3.5 text-amber-600" />
                <span>PDF</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── SECTION B: PRIMARY FINANCIAL WIDGETS (ASYMMETRIC) ─────────────── */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* WIDGET 1: REVENUE PERFORMANCE (65% width = 8 cols) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs lg:col-span-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                  Revenue Performance
                </span>
                <div className="mt-0.5 flex items-baseline gap-3">
                  <span className="text-2xl font-extrabold tracking-tight text-[#151922] sm:text-3xl tabular-nums">
                    {formatCurrency(data.revenue.month)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
                    <TrendingUp className="h-3 w-3" />
                    +14.8% vs prior
                  </span>
                </div>
              </div>

              {/* Invoiced vs Collections Context */}
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <div>
                  <div className="text-[10px] text-[#747B8C] font-semibold uppercase">Invoiced (Mo)</div>
                  <div className="font-bold text-[#151922] tabular-nums">{formatCurrency(data.invoiced.month)}</div>
                </div>
                <div className="h-6 w-[1px] bg-slate-200" />
                <div>
                  <div className="text-[10px] text-[#747B8C] font-semibold uppercase">Cumulative Collected</div>
                  <div className="font-bold text-teal-700 tabular-nums">{formatCurrency(data.revenue.cumulative)}</div>
                </div>
              </div>
            </div>

            {/* Interactive Revenue Trend Area Chart */}
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPnlSummary} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revAreaTeal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0D9488" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0D9488" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: '#747B8C' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#747B8C' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as PnlSummaryItem;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs space-y-1">
                          <div className="font-bold text-[#151922] border-b border-slate-100 pb-1">
                            {item.period}
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-[#747B8C]">Collected Revenue:</span>
                            <span className="font-bold text-teal-700">{formatCurrency(item.revenue)}</span>
                          </div>
                          {compareMode && (
                            <div className="flex justify-between gap-4">
                              <span className="text-[#747B8C]">Overheads:</span>
                              <span className="font-bold text-violet-700">{formatCurrency(item.expense)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
                            <span className="text-[#747B8C]">Net Operating:</span>
                            <span className={cn('font-bold', item.profit >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                              {formatCurrency(item.profit)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0D9488"
                    strokeWidth={2.5}
                    fill="url(#revAreaTeal)"
                  />
                  {compareMode && (
                    <Line
                      type="monotone"
                      dataKey="expense"
                      stroke="#8B5CF6"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3, fill: '#8B5CF6' }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-[#747B8C]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-semibold text-teal-700">
                <span className="h-2 w-2 rounded-full bg-teal-600" />
                Collected Revenue
              </span>
              {compareMode && (
                <span className="flex items-center gap-1.5 font-semibold text-violet-700">
                  <span className="h-2 w-2 rounded-full bg-violet-600" />
                  Expenses (Comparison)
                </span>
              )}
            </div>
            <span>Period: {range.toUpperCase()}</span>
          </div>
        </div>

        {/* WIDGET 2: FINANCIAL HEALTH & RATIOS (35% width = 4 cols) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                Financial Health &amp; Ratios
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                Healthy
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {/* Operating Profit */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#747B8C]">Operating Profit (Month)</span>
                  <Badge
                    tone={data.profit.month >= 0 ? 'teal' : 'danger'}
                    className="text-[10px] !px-1.5 !py-0 font-bold"
                  >
                    {data.profit.month >= 0 ? 'Surplus' : 'Deficit'}
                  </Badge>
                </div>
                <div className={cn('mt-1 text-xl font-black tabular-nums', data.profit.month >= 0 ? 'text-teal-800' : 'text-rose-600')}>
                  {formatCurrency(data.profit.month)}
                </div>
              </div>

              {/* Profit Margin with Visual Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#747B8C]">Operating Profit Margin</span>
                  <span className="font-bold text-[#151922] tabular-nums">{formatPercent(data.profit.margin)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-all duration-500"
                    style={{ width: `${Math.max(5, Math.min(100, data.profit.margin))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#747B8C]">
                  <span>Target: 25.0%</span>
                  <span>{data.profit.margin >= 25 ? 'Target Exceeded' : 'Under Target'}</span>
                </div>
              </div>

              {/* Collection Rate */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#747B8C]">Invoice Collection Rate</span>
                  <span className="font-bold text-indigo-700 tabular-nums">{collectionRate}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${collectionRate}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#747B8C]">
                  <span>Collected: {formatCurrency(data.invoiced.collectedMonth)}</span>
                  <span>Billed: {formatCurrency(data.invoiced.month)}</span>
                </div>
              </div>

              {/* Outstanding Receivables Balance */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="font-semibold text-[#747B8C]">Total Outstanding AR</span>
                <span className="font-bold text-violet-700 tabular-nums">{formatCurrency(data.ar.outstanding)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-2.5 text-xs text-teal-800 flex items-center justify-between">
            <span className="font-medium">Liquid Treasury Reserve:</span>
            <span className="font-bold tabular-nums">{formatCurrency(data.treasury.totalLiquid)}</span>
          </div>
        </div>
      </div>

      {/* ── SECTION B (CONT): CASH FLOW, EXPENSES, RECEIVABLES AGING ──────── */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* WIDGET 3: CASH FLOW (Inflow vs Outflow) — 4 cols */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                  Cash Flow (Inflow vs Outflow)
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-[#151922] tabular-nums">
                    {formatCurrency(data.revenue.month - data.expenses.month)}
                  </span>
                  <span className="text-xs text-[#747B8C]">Net Cash</span>
                </div>
              </div>
            </div>

            <div className="mt-4 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartPnlSummary} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#747B8C' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#747B8C' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as PnlSummaryItem;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-md text-xs space-y-1">
                          <div className="font-bold text-[#151922]">{item.period}</div>
                          <div className="text-teal-700">Inflow: {formatCurrency(item.revenue)}</div>
                          <div className="text-rose-600">Outflow: {formatCurrency(item.expense)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" name="Inflow" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="expense" name="Outflow" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-[#747B8C]">
            <span className="flex items-center gap-1.5 font-semibold text-teal-700">
              <span className="h-2 w-2 rounded-full bg-teal-600" />
              Inflows ({formatCurrency(data.revenue.month)})
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Outflows ({formatCurrency(data.expenses.month)})
            </span>
          </div>
        </div>

        {/* WIDGET 4: EXPENSE BREAKDOWN (Interactive Donut) — 4 cols */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                Expense Breakdown
              </span>
              <span className="text-xs font-semibold text-[#151922] tabular-nums">
                Total: {formatCurrency(totalExpenseSum)}
              </span>
            </div>

            {/* Donut Chart with Center Total */}
            <div className="relative mt-2 h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.expenses.byCategory}
                    dataKey="total"
                    nameKey="_id"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={3}
                    onMouseEnter={(_, index) => setHoveredExpenseIndex(index)}
                    onMouseLeave={() => setHoveredExpenseIndex(null)}
                  >
                    {(data.expenses.byCategory || []).map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]}
                        stroke={hoveredExpenseIndex === index ? '#151922' : 'none'}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const c = payload[0].payload as { _id: string; total: number };
                      const pct = totalExpenseSum > 0 ? ((c.total / totalExpenseSum) * 100).toFixed(1) : '0';
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-md">
                          <div className="font-bold text-[#151922]">{c._id}</div>
                          <div className="text-slate-600 font-semibold">{formatCurrency(c.total)} ({pct}%)</div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#747B8C]">Expenses</span>
                <span className="text-sm font-extrabold text-[#151922] tabular-nums">
                  {formatCurrency(totalExpenseSum)}
                </span>
              </div>
            </div>

            {/* Compact Category Legend */}
            <div className="mt-2 space-y-1.5 max-h-24 overflow-y-auto pr-1">
              {(data.expenses.byCategory || []).slice(0, 4).map((c, idx) => {
                const pct = totalExpenseSum > 0 ? Math.round((c.total / totalExpenseSum) * 100) : 0;
                return (
                  <div
                    key={c._id}
                    className="flex items-center justify-between text-xs py-0.5"
                    onMouseEnter={() => setHoveredExpenseIndex(idx)}
                    onMouseLeave={() => setHoveredExpenseIndex(null)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length] }}
                      />
                      <span className="truncate text-slate-700">{c._id}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums font-semibold shrink-0">
                      <span className="text-slate-400 text-[11px]">{pct}%</span>
                      <span className="text-[#151922]">{formatCurrency(c.total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2 text-[11px] text-[#747B8C] text-right">
            <span>{data.expenses.byCategory?.length || 0} active categories</span>
          </div>
        </div>

        {/* WIDGET 5: RECEIVABLES AGING (Horizontal Stacked Bar) — 4 cols */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                Receivables Aging
              </span>
              <span className="text-xs font-bold text-violet-700 tabular-nums">
                Total: {formatCurrency(data.ar.outstanding)}
              </span>
            </div>

            {/* Horizontal Stacked Bar Distribution */}
            <div className="mt-4 space-y-2">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(agingBuckets['0-30'].amount / totalArAmount) * 100}%` }}
                  title={`0-30 Days: ${formatCurrency(agingBuckets['0-30'].amount)}`}
                />
                <div
                  className="bg-teal-500 transition-all duration-500"
                  style={{ width: `${(agingBuckets['31-60'].amount / totalArAmount) * 100}%` }}
                  title={`31-60 Days: ${formatCurrency(agingBuckets['31-60'].amount)}`}
                />
                <div
                  className="bg-amber-500 transition-all duration-500"
                  style={{ width: `${(agingBuckets['61-90'].amount / totalArAmount) * 100}%` }}
                  title={`61-90 Days: ${formatCurrency(agingBuckets['61-90'].amount)}`}
                />
                <div
                  className="bg-rose-500 transition-all duration-500"
                  style={{ width: `${(agingBuckets['90+'].amount / totalArAmount) * 100}%` }}
                  title={`90+ Days: ${formatCurrency(agingBuckets['90+'].amount)}`}
                />
              </div>

              {/* Bucket Breakdown Cards */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-medium text-slate-700">0–30 Days (Current)</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-bold text-[#151922]">{formatCurrency(agingBuckets['0-30'].amount)}</span>
                    <span className="ml-1 text-[10px] text-slate-400">({agingBuckets['0-30'].count})</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                    <span className="font-medium text-slate-700">31–60 Days</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-bold text-teal-800">{formatCurrency(agingBuckets['31-60'].amount)}</span>
                    <span className="ml-1 text-[10px] text-slate-400">({agingBuckets['31-60'].count})</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="font-semibold text-amber-800">61–90 Days (Overdue)</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-bold text-amber-700">{formatCurrency(agingBuckets['61-90'].amount)}</span>
                    <span className="ml-1 text-[10px] text-amber-500">({agingBuckets['61-90'].count})</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="font-semibold text-rose-800">90+ Days (Critical)</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-bold text-rose-700">{formatCurrency(agingBuckets['90+'].amount)}</span>
                    <span className="ml-1 text-[10px] text-rose-500">({agingBuckets['90+'].count})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 text-right">
            <Link to="/finance/invoices" className="text-xs font-semibold text-teal-700 hover:underline">
              View All Invoices &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* ── WIDGET 6: RECENT TRANSACTIONS TABLE & DETAILS DRAWER ──────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-[#151922] tracking-tight">Recent Ledger Transactions</h3>
            <p className="text-xs text-[#747B8C]">Real-time record of approved revenue inflows and operating expenses</p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search counterparty or category…"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="h-8.5 w-48 sm:w-60 pl-8 text-xs bg-slate-50/60 border-slate-200 focus:bg-white"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTxTypeFilter('all')}
                className={cn('rounded px-2.5 py-1 transition', txTypeFilter === 'all' ? 'bg-white font-bold shadow-2xs text-[#151922]' : 'text-[#747B8C]')}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTxTypeFilter('revenue')}
                className={cn('rounded px-2.5 py-1 transition', txTypeFilter === 'revenue' ? 'bg-white font-bold shadow-2xs text-teal-700' : 'text-[#747B8C]')}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setTxTypeFilter('expense')}
                className={cn('rounded px-2.5 py-1 transition', txTypeFilter === 'expense' ? 'bg-white font-bold shadow-2xs text-rose-700' : 'text-[#747B8C]')}
              >
                Expense
              </button>
            </div>

            <Link to="/finance/transactions">
              <Button size="sm" variant="outline" className="text-xs h-8.5 font-medium">
                Full Ledger &rarr;
              </Button>
            </Link>
          </div>
        </div>

        {/* Table Content */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">
                <th className="py-2.5 pr-4">Transaction / Title</th>
                <th className="py-2.5 px-4">Counterparty</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 pl-4 text-right">Amount</th>
                <th className="py-2.5 pl-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx) => (
                <tr
                  key={tx._id}
                  onClick={() => setSelectedTx(tx)}
                  className="cursor-pointer transition-colors hover:bg-slate-50/80 group"
                >
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-[#151922] group-hover:text-teal-700 transition">
                      {tx.title || tx.category || 'Ledger Entry'}
                    </div>
                    {tx.notes && <div className="text-[11px] text-slate-400 truncate max-w-xs">{tx.notes}</div>}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-700">
                    {tx.client?.company || tx.client?.name || tx.vendor?.name || 'Internal'}
                  </td>
                  <td className="py-3 px-4 text-[#747B8C] tabular-nums whitespace-nowrap">
                    {formatDate(tx.date)}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {tx.category}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge tone={statusTone(tx.status)} className="text-[10px] !px-1.5 !py-0 font-bold uppercase">
                      {tx.status}
                    </Badge>
                  </td>
                  <td className="py-3 pl-4 text-right font-bold tabular-nums whitespace-nowrap">
                    <span className={tx.type === 'revenue' ? 'text-teal-700' : 'text-slate-900'}>
                      {tx.type === 'revenue' ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="py-3 pl-2 text-right">
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 transition inline-block" />
                  </td>
                </tr>
              ))}
              {!filteredTransactions.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#747B8C]">
                    No transactions match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-[#747B8C]">
          <span>
            Showing {filteredTransactions.length} entries &middot; Page {transactionsQuery.data?.pagination?.page || 1} of{' '}
            {transactionsQuery.data?.pagination?.pages || 1}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={txPage <= 1}
              onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              type="button"
              disabled={txPage >= (transactionsQuery.data?.pagination?.pages || 1)}
              onClick={() => setTxPage((p) => p + 1)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION C: FINANCIAL OPERATIONS ──────────────────────────────── */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Financial Operations &amp; Liabilities
            </h3>
            <p className="text-[11px] text-[#747B8C]">
              Upcoming vendor dispatches, collection queue, and liquid treasury balances
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Card 1: Upcoming Vendor Payables */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-[#151922]">Vendor Payables</span>
                </div>
                <span className="text-xs font-bold text-amber-700 tabular-nums">
                  {formatCurrency(data.vendorPayables.outstanding)}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {(data.vendorPayables.upcoming || []).slice(0, 4).map((vp) => (
                  <div
                    key={vp._id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#151922]">{vp.vendor?.name || 'Creator / Vendor'}</div>
                      <div className="text-[10px] text-[#747B8C]">Due {formatDate(vp.date)}</div>
                    </div>
                    <div className="font-bold text-amber-700 tabular-nums">{formatCurrency(vp.amount)}</div>
                  </div>
                ))}
                {!data.vendorPayables.upcoming?.length && (
                  <p className="py-6 text-center text-xs text-[#747B8C]">No pending vendor payables due in 30 days.</p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-right">
              <span className="text-[11px] text-[#747B8C]">
                {data.vendorPayables.count || 0} scheduled disbursements
              </span>
            </div>
          </div>

          {/* Card 2: Overdue Invoices & Collection Queue */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-100">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-[#151922]">Overdue Invoices</span>
                </div>
                <span className="text-xs font-bold text-rose-600">
                  {data.ar.overdue?.length || 0} Invoices
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {(data.ar.overdue || []).slice(0, 4).map((inv) => (
                  <div
                    key={inv._id}
                    className="rounded-xl border border-rose-100 bg-rose-50/40 p-2.5 text-xs transition hover:bg-rose-50/80"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#151922]">{inv.number || 'Invoice'}</span>
                      <span className="font-black text-rose-700 tabular-nums">{formatCurrency(inv.outstanding)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#747B8C]">
                      <span className="truncate max-w-[140px]">{inv.client?.company || inv.client?.name}</span>
                      <span className="text-rose-600 font-semibold">Due {formatDate(inv.dueDate)}</span>
                    </div>
                  </div>
                ))}
                {!data.ar.overdue?.length && (
                  <div className="py-6 text-center text-xs text-emerald-700 font-medium">
                    <CheckCircle2 className="mx-auto h-5 w-5 mb-1 opacity-70" />
                    All client accounts are currently in good standing.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-right">
              <Link to="/finance/invoices" className="text-xs font-semibold text-teal-700 hover:underline">
                Invoice Manager &rarr;
              </Link>
            </div>
          </div>

          {/* Card 3: Treasury Liquidity & Payroll Liability */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-[#151922]">Treasury &amp; Payroll Reserve</span>
                </div>
                <span className="text-xs font-bold text-teal-700 tabular-nums">
                  {formatCurrency(data.treasury.totalLiquid)}
                </span>
              </div>

              {/* Payroll Liability Alert */}
              <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-900">Pending Payroll Obligation</span>
                  <Badge tone="orange" className="text-[9px] !px-1.5 !py-0 font-bold uppercase">
                    Liabilities
                  </Badge>
                </div>
                <div className="mt-0.5 text-base font-extrabold text-amber-950 tabular-nums">
                  {formatCurrency(data.payrollLiability)}
                </div>
              </div>

              {/* Bank Accounts List */}
              <div className="mt-3 space-y-1.5">
                {data.treasury.accounts.map((a) => (
                  <div
                    key={a._id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{a.name}</div>
                      <div className="text-[10px] text-[#747B8C]">
                        {a.bank} &middot; ••••{a.accountLast4}
                      </div>
                    </div>
                    <div className="font-bold text-[#151922] tabular-nums">{formatCurrency(a.balance)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
              <span className="text-[#747B8C]">Net Liquid Buffer:</span>
              <span className="font-bold text-teal-800 tabular-nums">
                {formatCurrency(data.treasury.totalLiquid - data.payrollLiability)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TRANSACTION DETAILS MODAL CARD ───────────────────────────────────── */}
      {selectedTx && (
        <Modal
          size="md"
          open={!!selectedTx}
          onClose={() => setSelectedTx(null)}
          title="Transaction Details"
          description={`Reference ID: ${selectedTx._id}`}
        >
          <div className="space-y-5 text-xs text-[#151922]">
            {/* Amount Hero */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-center">
              <div className="text-xs font-semibold text-[#747B8C] uppercase tracking-wider">Amount</div>
              <div
                className={cn(
                  'mt-1 text-3xl font-black tabular-nums tracking-tight',
                  selectedTx.type === 'revenue' ? 'text-teal-700' : 'text-slate-900'
                )}
              >
                {selectedTx.type === 'revenue' ? '+' : '-'}
                {formatCurrency(selectedTx.amount)}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Badge tone={selectedTx.type === 'revenue' ? 'teal' : 'default'} className="font-bold uppercase">
                  {selectedTx.type}
                </Badge>
                <Badge tone={statusTone(selectedTx.status)} className="font-bold uppercase">
                  {selectedTx.status}
                </Badge>
              </div>
            </div>

            {/* Structured Details Grid */}
            <div className="space-y-3 rounded-xl border border-slate-200/80 p-4">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-[#747B8C]">Category</span>
                <span className="font-semibold text-[#151922]">{selectedTx.category}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-[#747B8C]">Transaction Date</span>
                <span className="font-semibold text-[#151922] tabular-nums">{formatDate(selectedTx.date)}</span>
              </div>
              {selectedTx.client && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-[#747B8C]">Client</span>
                  <span className="font-semibold text-[#151922]">
                    {selectedTx.client.company || selectedTx.client.name}
                  </span>
                </div>
              )}
              {selectedTx.vendor && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-[#747B8C]">Vendor</span>
                  <span className="font-semibold text-[#151922]">{selectedTx.vendor.name}</span>
                </div>
              )}
              {selectedTx.paymentMethod && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-[#747B8C]">Payment Method</span>
                  <span className="font-semibold text-[#151922]">{selectedTx.paymentMethod}</span>
                </div>
              )}
              {selectedTx.createdBy?.name && (
                <div className="flex justify-between">
                  <span className="text-[#747B8C]">Recorded By</span>
                  <span className="font-semibold text-[#151922]">{selectedTx.createdBy.name}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {selectedTx.notes && (
              <div className="rounded-xl border border-slate-200/80 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#747B8C]">Notes &amp; Memo</div>
                <div className="mt-1 text-slate-700 leading-relaxed">{selectedTx.notes}</div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(selectedTx._id);
                  toast.success('Copied transaction ID to clipboard');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy ID</span>
              </Button>
              <Button
                variant="primary"
                className="flex-1 text-xs"
                onClick={() => setSelectedTx(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
