import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileCheck2,
  FolderKanban,
  IndianRupee,
  Layers,
  MoreVertical,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useDashboardStore } from '@/stores/dashboardStore';
import { KpiCard } from '@/components/charts/KpiCard';
import { OverviewDonutCard } from '@/features/dashboard/OverviewDonutCard';
import { Card, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';
import { AttendanceWidget, isAttendanceExempt } from '@/features/attendance/AttendanceWidget';
import { PersonalActivityHeatmap } from '@/features/attendance/components/PersonalActivityHeatmap';
import { ProfileSection } from '@/features/dashboard/ProfileSection';

const ranges = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' },
];

export function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  // Managers and standard employees work on operational boards; only CEO gets the executive admin overview
  if (role === 'employee' || role === 'finance' || role === 'manager') {
    return <EmployeeDashboard />;
  }
  return <CeoDashboard />;
}

function showPersonalAttendance(role?: string | null) {
  return !isAttendanceExempt(role);
}

function getDateRangeDisplay(rangeId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const curMonth = monthNames[now.getMonth()];

  if (rangeId === 'today') {
    return `${curMonth} ${now.getDate()}, ${year}`;
  }
  if (rangeId === '7d') {
    const past = new Date();
    past.setDate(past.getDate() - 7);
    return `${monthNames[past.getMonth()]} ${past.getDate()} - ${curMonth} ${now.getDate()}, ${year}`;
  }
  if (rangeId === '30d') {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    return `${monthNames[past.getMonth()]} ${past.getDate()} - ${curMonth} ${now.getDate()}, ${year}`;
  }
  if (rangeId === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `Q${q} ${year} (Quarter to date)`;
  }
  if (rangeId === 'year') {
    return `Jan 1, ${year} - Dec 31, ${year}`;
  }
  // Default 'month'
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return `${curMonth} 1, ${year} - ${curMonth} ${lastDay}, ${year}`;
}

function exportDashboardCSV(kpis: any, range: string) {
  if (!kpis) {
    toast.error('No dashboard metrics available to export');
    return;
  }
  const rows = [
    ['STAR MEDIA CRM - Executive Dashboard Export'],
    [`Generated Date: ${new Date().toISOString()}`],
    [`Reporting Period: ${range}`],
    [],
    ['Financial Performance', 'Amount / Value', 'Change vs Last Period'],
    ['Collected Revenue', kpis.revenue?.value ?? 0, `${kpis.revenue?.change ?? 0}%`],
    ['Operating Profit', kpis.netProfit?.value ?? 0, `${kpis.netProfit?.change ?? 0}%`],
    ['Agency Expenses', kpis.expenses?.value ?? 0, `${kpis.expenses?.change ?? 0}%`],
    ['Profit Margin', `${kpis.margin?.value ?? 0}%`, `${kpis.margin?.change ?? 0}%`],
    ['Outstanding Receivables', kpis.outstandingReceivables?.value ?? 0, '-'],
    [],
    ['Operations & Workflow', 'Count'],
    ['Active Clients', kpis.activeClients?.value ?? 0],
    ['New Clients', kpis.newClients?.value ?? 0],
    ['Open Leads & Deals', kpis.openLeads?.value ?? 0],
    ['Active Projects', kpis.activeProjects?.value ?? 0],
    ['Completed Projects', kpis.completedProjects?.value ?? 0],
    ['Tasks Completed', kpis.tasksCompleted?.value ?? 0],
    ['Pending Tasks', kpis.pendingTasks?.value ?? 0],
    ['Overdue Tasks', kpis.overdueTasks?.value ?? 0],
    ['Pending Approvals', kpis.pendingApprovals?.value ?? 0],
    ['Checked in Today', kpis.checkedInNow?.value ?? 0],
    ['Missing Attendance Checkouts', kpis.attendanceExceptions?.value ?? 0],
  ];

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `starmedia-crm-${range}-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success('Dashboard metrics successfully exported to CSV');
}

function CeoDashboard() {
  const [range, setRange] = useState('month');
  const [trendFilter, setTrendFilter] = useState<'7D' | '30D' | '90D' | '12M'>('30D');
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const cachedData = useDashboardStore((s) => s.ceoData[range]);
  const setCeoData = useDashboardStore((s) => s.setCeoData);

  const {
    data: remoteData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-ceo', range],
    queryFn: async () => {
      const res = (await api.get('/dashboard/ceo', { params: { range } })).data.data;
      if (res) setCeoData(range, res);
      return res;
    },
    placeholderData: cachedData ? () => cachedData : (prev) => prev,
    staleTime: 60_000,
  });

  const data = remoteData || cachedData;

  // Real audit logs for the recent activity timeline
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['dashboard-audit-logs'],
    queryFn: async () => {
      try {
        const res = await api.get('/settings/audit-logs', { params: { limit: 6 } });
        return res.data.data?.items || [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  // Real employee directory preview for team members widget
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['dashboard-team-preview'],
    queryFn: async () => {
      try {
        const res = await api.get('/attendance/analytics/employee-directory');
        return res.data.data?.employees || [];
      } catch {
        // Fallback to /users
        try {
          const ures = await api.get('/users', { params: { limit: 6, status: 'active' } });
          const items = ures.data.data?.items || [];
          return items.map((u: any) => ({
            user: u,
            todayStatus: 'active',
            todayMinutes: 0,
          }));
        } catch {
          return [];
        }
      }
    },
    staleTime: 60_000,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/approvals/${id}/approve`),
    onSuccess: () => {
      toast.success('Approval granted successfully');
      qc.invalidateQueries({ queryKey: ['dashboard-ceo'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reject = useMutation({
    mutationFn: async (id: string) =>
      api.post(`/approvals/${id}/reject`, { reason: 'Rejected from executive dashboard' }),
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['dashboard-ceo'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-5 bg-[#F7F8FA] min-h-screen pb-12 font-sans p-1">
        <Skeleton className="h-14 rounded-2xl w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const k = data?.kpis;

  // Enriched revenue trend chart data with operating profit
  const chartData = useMemo(() => {
    if (!data?.revenueVsExpenses || !data.revenueVsExpenses.length) {
      return [
        { month: 'Oct 1', revenue: 0, expenses: 1000, operatingProfit: -1000 },
        { month: 'Oct 5', revenue: 0, expenses: 800, operatingProfit: -800 },
        { month: 'Oct 10', revenue: 0, expenses: 1000, operatingProfit: -1000 },
        { month: 'Oct 15', revenue: 0, expenses: 600, operatingProfit: -600 },
        { month: 'Oct 20', revenue: 0, expenses: 500, operatingProfit: -500 },
        { month: 'Oct 25', revenue: 0, expenses: 400, operatingProfit: -400 },
        { month: 'Oct 31', revenue: 0, expenses: 500, operatingProfit: -500 },
      ];
    }
    return data.revenueVsExpenses.map((d: any) => ({
      month: d.month || 'Month',
      revenue: Number(d.revenue || 0),
      expenses: Number(d.expenses || 0),
      operatingProfit: Number((d.revenue || 0) - (d.expenses || 0)),
    }));
  }, [data?.revenueVsExpenses]);

  return (
    <div className="space-y-5 bg-[#F7F8FA] min-h-screen pb-12 font-sans text-[#171923]">
      {/* ========================================================= */}
      {/* 1. MAIN DASHBOARD HEADER & CONTROLS                       */}
      {/* ========================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#171923] sm:text-2xl">
            Welcome back, {user?.name ? user.name.split(' ')[0] : 'Director'} 👋
          </h1>
          <p className="mt-0.5 text-xs text-[#667085]">
            Here's what's happening with your business today.
          </p>
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Dropdown Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#171923] shadow-2xs transition hover:bg-slate-50 hover:border-slate-300"
            >
              <Clock className="h-3.5 w-3.5 text-[#667085]" />
              <span>{getDateRangeDisplay(range)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#667085]" />
            </button>

            {showRangeDropdown && (
              <div className="absolute right-0 z-30 mt-1.5 w-48 rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-lg">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#667085]">
                  Select Time Window
                </div>
                {ranges.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRange(r.id);
                      setShowRangeDropdown(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      range === r.id
                        ? 'bg-[#0D9488]/10 text-[#0D9488] font-bold'
                        : 'text-[#171923] hover:bg-slate-50'
                    }`}
                  >
                    <span>{r.label}</span>
                    {range === r.id && <span className="h-1.5 w-1.5 rounded-full bg-[#0D9488]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh Data Button */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#171923] shadow-2xs transition hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#667085] ${isFetching ? 'animate-spin text-[#0D9488]' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Export Metrics Button */}
          <button
            type="button"
            onClick={() => exportDashboardCSV(k, range)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-[#0D9488] px-3.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#0f766e] active:scale-98"
            title="Export dashboard data to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. COMPACT PROFILE HEADER                                  */}
      {/* ========================================================= */}
      <ProfileSection />

      {/* Loading & Error States */}
      {(!data || !k) && isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : isError && (!data || !k) ? (
        <Card className="p-8 text-center bg-white border-[#E5E7EB] shadow-2xs rounded-xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <h3 className="mt-3 text-base font-bold text-[#171923]">Unable to load dashboard data</h3>
          <p className="mt-1 text-xs text-[#667085] max-w-sm mx-auto">{getErrorMessage(error)}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => refetch()} size="sm" variant="teal">
              Retry Loading
            </Button>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/login')}>
              Sign In Again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ========================================================= */}
          {/* 3. ROW 1: FINANCIAL PERFORMANCE KPI CARDS (4 CARDS)        */}
          {/* ========================================================= */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Collected Revenue"
              value={k.revenue.value}
              change={k.revenue.change}
              sparkline={k.revenue.sparkline}
              format="currency"
              accent="teal"
              to="/finance"
              periodLabel="vs last period"
            />
            <KpiCard
              label="Operating Profit"
              value={k.netProfit.value}
              change={k.netProfit.change}
              sparkline={k.netProfit.sparkline}
              format="currency"
              accent="purple"
              to="/finance"
              periodLabel="vs last period"
            />
            <KpiCard
              label="Agency Expenses"
              value={k.expenses.value}
              change={k.expenses.change}
              sparkline={k.expenses.sparkline}
              format="currency"
              accent="orange"
              to="/finance"
              periodLabel="vs last period"
            />
            <KpiCard
              label="Profit Margin"
              value={k.margin.value}
              change={k.margin.change}
              format="percent"
              accent="green"
              to="/finance"
              periodLabel="vs last period"
            />
          </div>

          {/* ========================================================= */}
          {/* 4. ROW 2: ASYMMETRIC GRID (REVENUE TREND + SUMMARY + NEEDS ATTENTION) */}
          {/* ========================================================= */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Widget 1: Revenue Trend (6 columns on lg/xl) */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs lg:col-span-6">
              <div>
                {/* Header with Title and Range Filters */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#0D9488] border border-[#A7F3D0]/60">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#171923] tracking-tight">Revenue Trend</h3>
                      <p className="text-[11px] text-[#667085]">Collection, expenses and profit overview</p>
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-slate-50 p-1">
                    {(['7D', '30D', '90D', '12M'] as const).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setTrendFilter(tf)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                          trendFilter === tf
                            ? 'bg-white text-[#171923] shadow-2xs font-bold'
                            : 'text-[#667085] hover:text-[#171923]'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-3.5 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-[#171923]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" />
                    <span>Revenue</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-[#171923]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                    <span>Expenses</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-[#171923]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#7C3AED]" />
                    <span>Operating Profit</span>
                  </div>
                </div>

                {/* Recharts Area / Line Chart */}
                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0D9488" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#0D9488" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="expAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F97316" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#F97316" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: '#667085' }}
                        axisLine={{ stroke: '#E5E7EB' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#667085' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-md text-xs">
                              <p className="font-bold text-[#171923] mb-1.5">{label}</p>
                              <div className="space-y-1">
                                {payload.map((entry, idx) => (
                                  <div key={idx} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                      />
                                      <span className="text-[#667085]">{entry.name}:</span>
                                    </div>
                                    <span className="font-bold text-[#171923]">
                                      {formatCurrency(Number(entry.value || 0))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#0D9488"
                        strokeWidth={2}
                        fill="url(#revAreaGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Expenses"
                        stroke="#F97316"
                        strokeWidth={2}
                        fill="url(#expAreaGrad)"
                      />
                      <Line
                        type="monotone"
                        dataKey="operatingProfit"
                        name="Operating Profit"
                        stroke="#7C3AED"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#7C3AED' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Widget 2: Financial Summary (3 columns on lg/xl) */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs lg:col-span-3">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]/60">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#171923] tracking-tight">Financial Summary</h3>
                      <p className="text-[11px] text-[#667085]">Key metrics for this period</p>
                    </div>
                  </div>
                  <Link to="/finance" className="text-[#667085] hover:text-[#171923]">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#667085]">Collected Revenue</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#171923]">{formatCurrency(k.revenue.value)}</span>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        ↑ {Math.abs(k.revenue.change || 0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#667085]">Agency Expenses</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#171923]">{formatCurrency(k.expenses.value)}</span>
                      <span className="text-[10px] font-semibold text-rose-600">
                        ↑ {Math.abs(k.expenses.change || 0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#667085]">Operating Profit</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#171923]">{formatCurrency(k.netProfit.value)}</span>
                      <span className="text-[10px] font-semibold text-rose-600">
                        ↓ {Math.abs(k.netProfit.change || 0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#667085]">Profit Margin</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#171923]">{formatPercent(k.margin.value)}</span>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        ↑ {Math.abs(k.margin.change || 0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="text-[#667085]">Outstanding Receivables</span>
                    <span className="font-bold text-[#171923]">
                      {formatCurrency(k.outstandingReceivables.value)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <Link
                  to="/finance"
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#171923] hover:text-[#0D9488] transition"
                >
                  <span>View Full Finance Overview</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Widget 3: Needs Attention (3 columns on lg/xl) */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs lg:col-span-3">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]/60">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#171923] tracking-tight">Needs Attention</h3>
                      <p className="text-[11px] text-[#667085]">Items that require your attention</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {/* Pending Approvals */}
                  <Link
                    to="/approvals"
                    className="flex items-center justify-between rounded-lg p-2 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#DC2626]">
                        <FileCheck2 className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-[#171923]">Pending Approvals</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          (k.pendingApprovals?.value ?? 0) > 0
                            ? 'bg-[#FEF2F2] text-[#DC2626]'
                            : 'bg-slate-100 text-[#667085]'
                        }`}
                      >
                        {k.pendingApprovals?.value ?? 0}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>

                  {/* Overdue Invoices */}
                  <Link
                    to="/finance/invoices"
                    className="flex items-center justify-between rounded-lg p-2 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFFBEB] text-[#D97706]">
                        <IndianRupee className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-[#171923]">Overdue Invoices</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#667085]">
                        0
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>

                  {/* Missing Check-outs */}
                  <Link
                    to="/attendance"
                    className="flex items-center justify-between rounded-lg p-2 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFFBEB] text-[#D97706]">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-[#171923]">Missing Check-outs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          (k.attendanceExceptions?.value ?? 0) > 0
                            ? 'bg-[#FEF2F2] text-[#DC2626]'
                            : 'bg-slate-100 text-[#667085]'
                        }`}
                      >
                        {k.attendanceExceptions?.value ?? 0}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>

                  {/* Overdue Tasks */}
                  <Link
                    to="/tasks/monitoring"
                    className="flex items-center justify-between rounded-lg p-2 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#DC2626]">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-[#171923]">Overdue Tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          (k.overdueTasks?.value ?? 0) > 0
                            ? 'bg-[#FEF2F2] text-[#DC2626]'
                            : 'bg-slate-100 text-[#667085]'
                        }`}
                      >
                        {k.overdueTasks?.value ?? 0}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>

                  {/* Unassigned Leads */}
                  <Link
                    to="/leads"
                    className="flex items-center justify-between rounded-lg p-2 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F5F3FF] text-[#7C3AED]">
                        <Layers className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-[#171923]">Unassigned Leads</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#667085]">
                        {k.openLeads?.value ?? 0}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </Link>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <Link
                  to="/alerts"
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#171923] hover:text-[#0D9488] transition"
                >
                  <span>View All Alerts</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 5. ROW 3: OPERATIONAL OVERVIEW DONUT CARDS (4 CARDS)        */}
          {/* ========================================================= */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* 1. Clients Overview */}
            <OverviewDonutCard
              title="Clients Overview"
              subtitle="Total clients and lead status"
              icon={Users}
              iconTone="blue"
              totalLabel={String(k.clients?.value ?? ((k.activeClients?.value ?? 0) + (k.newClients?.value ?? 0)))}
              totalSubtext="Total Clients"
              segments={[
                {
                  label: 'Active',
                  count: k.activeClients?.value ?? 0,
                  color: '#0D9488',
                },
                {
                  label: 'New',
                  count: k.newClients?.value ?? 0,
                  color: '#0284C7',
                },
                {
                  label: 'Inactive',
                  count: k.openLeads?.value ?? 0,
                  color: '#94A3B8',
                },
              ]}
              linkTo="/clients"
              linkLabel="Manage Clients"
            />

            {/* 2. Projects Overview */}
            <OverviewDonutCard
              title="Projects Overview"
              subtitle="Project status distribution"
              icon={Briefcase}
              iconTone="indigo"
              totalLabel={String(k.activeProjects.value + (k.completedProjects?.value ?? 0))}
              totalSubtext="Total Projects"
              segments={[
                {
                  label: 'Active',
                  count: k.activeProjects.value,
                  color: '#0D9488',
                },
                {
                  label: 'Completed',
                  count: k.completedProjects?.value ?? 0,
                  color: '#16A34A',
                },
                {
                  label: 'On Hold',
                  count: 0,
                  color: '#F59E0B',
                },
                {
                  label: 'Delayed',
                  count: 0,
                  color: '#EF4444',
                },
              ]}
              linkTo="/projects"
              linkLabel="View All Projects"
            />

            {/* 3. Task Completion */}
            <OverviewDonutCard
              title="Task Completion"
              subtitle="Task progress and status"
              icon={FileCheck2}
              iconTone="amber"
              totalLabel={String(
                k.tasksTotal?.value ??
                  (k.tasksCompleted.value + k.pendingTasks.value + k.overdueTasks.value)
              )}
              totalSubtext="Total Tasks"
              segments={[
                {
                  label: 'Completed',
                  count: k.tasksCompleted.value,
                  color: '#16A34A',
                },
                {
                  label: 'In Progress',
                  count: k.pendingTasks.value,
                  color: '#06B6D4',
                },
                {
                  label: 'Pending',
                  count: 0,
                  color: '#F59E0B',
                },
                {
                  label: 'Overdue',
                  count: k.overdueTasks.value,
                  color: '#EF4444',
                },
              ]}
              linkTo="/tasks/monitoring"
              linkLabel="Open Task Monitor"
            />

            {/* 4. Attendance Today */}
            <OverviewDonutCard
              title="Attendance Today"
              subtitle="Team attendance status"
              icon={UserCheck}
              iconTone="teal"
              totalLabel={
                k.employees?.value
                  ? `${Math.round(((k.checkedInNow?.value ?? 0) / k.employees.value) * 100)}%`
                  : '0%'
              }
              totalSubtext="Present"
              segments={[
                {
                  label: 'Present',
                  count: k.checkedInNow?.value ?? 0,
                  color: '#0D9488',
                },
                {
                  label: 'Absent',
                  count: Math.max(0, (k.employees?.value ?? 0) - (k.checkedInNow?.value ?? 0)),
                  color: '#94A3B8',
                },
                {
                  label: 'Missing Check-out',
                  count: k.attendanceExceptions?.value ?? 0,
                  color: '#F59E0B',
                },
              ]}
              linkTo="/attendance"
              linkLabel="View Attendance"
            />
          </div>

          {/* ========================================================= */}
          {/* 6. ROW 4: RECENT ACTIVITY & TEAM MEMBERS (2 COLUMNS)       */}
          {/* ========================================================= */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: Recent Activity Feed */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]/60">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#171923] tracking-tight">Recent Activity</h3>
                      <p className="text-[11px] text-[#667085]">Latest updates from your team</p>
                    </div>
                  </div>
                  <Link
                    to="/alerts?tab=notifications"
                    className="flex items-center gap-1 text-xs font-semibold text-[#171923] hover:text-[#0D9488] transition"
                  >
                    <span>View All</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="mt-3.5 space-y-3">
                  {auditLogs.length > 0 ? (
                    auditLogs.slice(0, 5).map((a: any, idx: number) => (
                      <div key={a._id || idx} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            name={a.actor?.name || 'Team member'}
                            avatar={a.actor?.avatar}
                            className="h-8 w-8 rounded-full text-xs shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#171923]">
                              <span className="font-bold">{a.actor?.name || 'Member'}</span>{' '}
                              <span className="text-[#667085]">
                                {a.action} {a.entity ? a.entity.toLowerCase() : 'record'}
                              </span>
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-[#667085] ml-2">
                          {formatDate(a.createdAt)}
                        </span>
                      </div>
                    ))
                  ) : (
                    // Fallback to recent transactions / notifications
                    (data.recentTransactions || []).slice(0, 4).map((t: any) => (
                      <div key={t._id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                            {t.type ? t.type[0].toUpperCase() : 'T'}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#171923]">
                              <span className="font-bold capitalize">{t.type}</span>: {t.category}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-bold text-[#0D9488] text-xs">
                          {formatCurrency(t.amount)}
                        </span>
                      </div>
                    ))
                  )}

                  {!auditLogs.length && !data.recentTransactions?.length && (
                    <div className="py-6 text-center text-xs text-[#667085]">
                      No recent team activities recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Team Members */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#0D9488] border border-[#A7F3D0]/60">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#171923] tracking-tight">Team Members</h3>
                      <p className="text-[11px] text-[#667085]">Total team members and their status</p>
                    </div>
                  </div>
                  <Link
                    to="/attendance"
                    className="flex items-center gap-1 text-xs font-semibold text-[#171923] hover:text-[#0D9488] transition"
                  >
                    <span>View Team</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="mt-3.5 space-y-3">
                  {teamMembers.slice(0, 4).map((m: any, idx: number) => {
                    const u = m.user || m;
                    const roleLabel =
                      u.role === 'manager'
                        ? 'Manager'
                        : u.role === 'finance'
                        ? 'Finance'
                        : 'Employee';

                    const durationMins = m.todayMinutes || 0;
                    const hoursStr =
                      durationMins > 0
                        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m today`
                        : '0m today';

                    return (
                      <div
                        key={u._id || idx}
                        className="flex items-center justify-between text-xs py-1.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            name={u.name}
                            avatar={u.avatar}
                            className="h-8 w-8 rounded-full text-xs shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#171923]">{u.name}</p>
                            <p className="truncate text-[11px] text-[#667085]">{u.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#16A34A] border border-[#BBF7D0]/60">
                            Active
                          </span>
                          <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-[#667085] border border-[#E5E7EB]">
                            {roleLabel}
                          </span>
                          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#667085] font-medium">
                            <Clock className="h-3 w-3" />
                            {hoursStr}
                          </span>
                          <Link to="/attendance" className="text-slate-400 hover:text-slate-600">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}

                  {!teamMembers.length && (
                    <div className="py-6 text-center text-xs text-[#667085]">
                      No active team members found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmployeeDashboard() {
  const role = useAuthStore((s) => s.user?.role);
  const user = useAuthStore((s) => s.user);

  const cachedData = useDashboardStore((s) => s.employeeData);
  const setEmployeeData = useDashboardStore((s) => s.setEmployeeData);

  const {
    data: remoteData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-employee'],
    queryFn: async () => {
      const res = (await api.get('/dashboard/employee')).data.data;
      if (res) setEmployeeData(res);
      return res;
    },
    placeholderData: cachedData ? () => cachedData : undefined,
    staleTime: 60_000,
  });

  const data = remoteData || cachedData;

  const { data: notes } = useQuery({
    queryKey: ['notifications-home'],
    queryFn: async () => (await api.get('/alerts/notifications', { params: { limit: 8 } })).data.data,
    staleTime: 30_000,
  });

  if (!data && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <Card className="p-8 text-center bg-white border-[#E5E7EB] shadow-2xs rounded-xl">
        <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
        <h3 className="mt-3 text-base font-bold text-[#171923]">Unable to load workspace</h3>
        <p className="mt-1 text-xs text-[#667085] max-w-sm mx-auto">{getErrorMessage(error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => refetch()} size="sm" variant="teal">
            Retry Loading
          </Button>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/login')}>
            Sign In Again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5 bg-[#F7F8FA] min-h-screen pb-12 font-sans text-[#171923]">
      {/* Employee Workspace Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#171923] sm:text-2xl">
            Welcome back, {user?.name ? user.name.split(' ')[0] : 'Team Member'} 👋
          </h1>
          <p className="mt-0.5 text-xs text-[#667085]">
            Track your daily deliverables, attendance check-in, and team communication.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/tasks">
            <Button size="sm" variant="teal" className="h-9 font-semibold text-xs shadow-2xs">
              My Task Board
            </Button>
          </Link>
          <Link to="/chat">
            <Button size="sm" variant="outline" className="h-9 font-semibold text-xs border-[#E5E7EB] bg-white text-[#171923]">
              Agency Chat
            </Button>
          </Link>
        </div>
      </div>

      {/* Profile & Photo Settings Strip */}
      <ProfileSection />

      {/* Personal Attendance Check-In Widget & Activity Heatmap */}
      {showPersonalAttendance(role) ? (
        <div className="space-y-5">
          <AttendanceWidget />
          <PersonalActivityHeatmap />
        </div>
      ) : null}

      {/* KPI Cards Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Hours Logged Today"
          value={Math.round((data.time.todayMinutes || 0) / 60)}
          accent="teal"
          icon={Clock}
          to="/attendance"
        />
        <KpiCard
          label="Hours This Week"
          value={Math.round((data.time.weekMinutes || 0) / 60)}
          accent="purple"
          icon={Clock}
          to="/attendance"
        />
        <KpiCard
          label="Sprint Completion"
          value={data.targets.progressAvg}
          format="percent"
          accent="orange"
          icon={TrendingUp}
          to="/tasks"
        />
      </div>

      {/* Tri-Color Task Columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { title: 'Due Today', items: data.tasks.today, tone: 'teal', accentColor: '#0D9488' },
          { title: 'This Week', items: data.tasks.week, tone: 'purple', accentColor: '#7C3AED' },
          { title: 'Overdue Items', items: data.tasks.overdue, tone: 'orange', accentColor: '#D97706' },
        ].map((col) => (
          <div key={col.title} className="rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs">
            <div className="mb-3.5 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-[#171923] tracking-tight">
                {col.title}{' '}
                <span className="ml-1 text-[11px] font-normal text-[#667085]">
                  ({col.items.length})
                </span>
              </h3>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-[#667085]">
                {col.items.length} items
              </span>
            </div>
            <div className="space-y-2">
              {col.items.slice(0, 6).map((t: any) => (
                <Link
                  key={t._id}
                  to="/tasks"
                  className="block rounded-lg border border-[#E5E7EB] bg-white p-2.5 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="text-xs font-semibold text-[#171923] truncate">{t.title}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[#667085]">
                    <Badge tone={statusTone(t.priority)} className="text-[10px] !px-1.5 !py-0">
                      {t.priority}
                    </Badge>
                    <span>Due {formatDate(t.dueDate)}</span>
                  </div>
                </Link>
              ))}
              {!col.items.length ? (
                <p className="py-6 text-center text-xs text-[#667085]">No tasks in this list</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Projects & Announcements */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs">
          <div className="mb-3.5 flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-[#171923] tracking-tight">Assigned Projects</h3>
            <Link to="/projects" className="text-xs font-semibold text-[#0D9488] hover:underline">
              All Projects
            </Link>
          </div>
          <div className="space-y-2">
            {(data.projects || []).map((p: any) => (
              <Link
                key={p._id}
                to="/projects"
                className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-white p-2.5 text-xs font-medium transition hover:border-slate-300"
              >
                <span className="font-semibold text-[#171923] truncate">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0D9488]">{p.progress}%</span>
                  <Badge tone={statusTone(p.status)} className="text-[10px]">
                    {p.status}
                  </Badge>
                </div>
              </Link>
            ))}
            {!data.projects?.length && (
              <p className="py-6 text-center text-xs text-[#667085]">No assigned projects</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs">
          <div className="mb-3.5 flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-[#171923] tracking-tight">Agency Announcements</h3>
            <Link to="/alerts?tab=notifications" className="text-xs font-semibold text-[#0D9488] hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-2">
            {(notes?.items || []).slice(0, 4).map((n: any) => (
              <div key={n._id} className="rounded-lg border border-[#E5E7EB] bg-white p-2.5 text-xs">
                <div className="font-bold text-[#171923]">{n.title}</div>
                <div className="mt-0.5 text-[11px] text-[#667085]">{n.message}</div>
              </div>
            ))}
            {!notes?.items?.length && (
              <p className="py-6 text-center text-xs text-[#667085]">No announcements</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
