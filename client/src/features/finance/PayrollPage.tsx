import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  User,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  Target,
  Sparkles,
  TrendingUp,
  Award,
  FileText,
  Check,
  Briefcase,
  Layers,
  ChevronRight,
  Info,
  Building2,
  ArrowUpRight,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

interface SalaryUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  employeeId?: string;
  department?: string;
  designation?: string;
  avatar?: string;
  salary?: { base?: number };
}

interface WorkDay {
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  durationMinutes: number;
  status: string;
}

interface AssignedProject {
  _id: string;
  name: string;
  status: string;
  progress: number;
  budget?: number;
  client?: { company?: string; name?: string };
  endDate?: string;
}

interface AssignedTask {
  _id: string;
  title: string;
  status: string;
  priority?: string;
  progress?: number;
  project?: { _id: string; name: string };
}

interface WorkSummaryResponse {
  employee: SalaryUser;
  period: string;
  workingDays: number;
  totalMinutes: number;
  totalHours: number;
  missingCheckout: number;
  days: WorkDay[];
  tasksTotal?: number;
  tasksCompleted?: number;
  projectsTotal?: number;
  projectsCompleted?: number;
  projects?: AssignedProject[];
  tasks?: AssignedTask[];
  suggestedAmount?: number;
  existingPayroll?: { _id: string; status: string; net: number } | null;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPastPeriods(count = 4) {
  const list: { id: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    list.push({ id, label: i === 0 ? `${label} (Current)` : label });
  }
  return list;
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function PayrollPage() {
  const role = useAuthStore((s) => s.user?.role);
  const can = useAuthStore((s) => s.can);
  const canManage = role === 'ceo' || role === 'finance' || can('payroll', 'manage');
  const canApprove = role === 'ceo' || can('payroll', 'approve');
  const qc = useQueryClient();

  const [tab, setTab] = useState<'pay' | 'payroll'>('pay');
  const [period, setPeriod] = useState(currentPeriod());
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDay, setSelectedDay] = useState<WorkDay | null>(null);

  const pastPeriods = useMemo(() => getPastPeriods(4), []);

  // Fetch employees list
  const { data: salaries } = useQuery({
    queryKey: ['salaries'],
    queryFn: async () => (await api.get('/finance/salaries')).data.data,
  });

  // Fetch selected employee work & project summary for month
  const { data: work, isFetching: workLoading } = useQuery({
    queryKey: ['salary-work', employeeId, period],
    queryFn: async () =>
      (await api.get(`/finance/salaries/${employeeId}/work-summary`, { params: { period } }))
        .data.data as WorkSummaryResponse,
    enabled: !!employeeId && !!period,
  });

  // Fetch payroll history
  const { data: payroll } = useQuery({
    queryKey: ['payroll', period],
    queryFn: async () =>
      (await api.get('/finance/payroll', { params: { limit: 100, period } })).data.data,
    enabled: tab === 'payroll',
  });

  // Mutation to pay salary
  const pay = useMutation({
    mutationFn: async () =>
      api.post('/finance/salaries/pay', {
        employeeId,
        period,
        amount: Number(amount),
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      toast.success('Salary saved and recorded as expense');
      setAmount('');
      setNotes('');
      qc.invalidateQueries({ queryKey: ['salary-work'] });
      qc.invalidateQueries({ queryKey: ['salaries'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['finance-overview'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      if (res.data.data.expense?._id) {
        toast.message('Recorded under Finance → Transactions (Employee Stipends)');
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/finance/payroll/${id}/approve`),
    onSuccess: () => {
      toast.success('Payroll approved');
      qc.invalidateQueries({ queryKey: ['payroll'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const disburse = useMutation({
    mutationFn: async (id: string) => api.post(`/finance/payroll/${id}/disburse`),
    onSuccess: () => {
      toast.success('Salary disbursed — expense recorded');
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['finance-overview'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const employees = (salaries?.items || []) as SalaryUser[];
  const selected = employees.find((e) => e._id === employeeId);
  const alreadyPaid = work?.existingPayroll?.status === 'disbursed';

  const payrollTotal = useMemo(
    () => (payroll?.items || []).reduce((s: number, p: { net: number }) => s + (p.net || 0), 0),
    [payroll]
  );

  // Auto-set suggested amount when work data loads
  useEffect(() => {
    if (work?.suggestedAmount) {
      setAmount(String(work.suggestedAmount));
    } else {
      setAmount('');
    }
  }, [work?.suggestedAmount, employeeId, period]);

  // Calendar Grid calculations for monthly activity heatmap
  const calendarGrid = useMemo(() => {
    if (!period) return [];
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0

    const daysMap = new Map<string, WorkDay>();
    (work?.days || []).forEach((d) => daysMap.set(d.date, d));

    const cells: {
      dayNumber: number;
      dateStr: string;
      workData?: WorkDay;
      isCurrentMonth: boolean;
    }[] = [];

    // Empty cells before first day
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({
        dayNumber: 0,
        dateStr: '',
        isCurrentMonth: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${period}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        workData: daysMap.get(dateStr),
        isCurrentMonth: true,
      });
    }

    return cells;
  }, [period, work?.days]);

  return (
    <div className="space-y-6">
      {/* Enterprise Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-teal-700 font-semibold">Finance &amp; Payroll</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Salary &amp; Payroll Management
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Review employee working time, attendance heatmap, completed deliverables, and disburse payroll.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setTab('pay')}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                tab === 'pay'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Pay &amp; Review Salary
            </button>
            <button
              type="button"
              onClick={() => setTab('payroll')}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                tab === 'payroll'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Payroll History
            </button>
          </div>

          <Link to="/finance/transactions">
            <Button variant="outline" size="sm" className="text-xs">
              View Expenses
            </Button>
          </Link>
        </div>
      </div>

      {tab === 'pay' ? (
        <>
          {/* Employee & Month Filter Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
            <div className="grid gap-4 lg:grid-cols-12">
              {/* Employee Selector */}
              <div className="lg:col-span-5">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  1. Select Employee
                </label>
                <Select
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setAmount('');
                    setSelectedDay(null);
                  }}
                  className="w-full text-xs"
                >
                  <option value="">Choose employee to review...</option>
                  {employees.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} &bull; {u.role} ({u.email})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Month / Period Filter with Quick Pills */}
              <div className="lg:col-span-7">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Select Month &amp; Period
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">Selected: {period}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pastPeriods.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPeriod(p.id);
                        setAmount('');
                        setSelectedDay(null);
                      }}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition border',
                        period === p.id
                          ? 'bg-teal-50 border-teal-300 text-teal-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}

                  <input
                    type="month"
                    value={period}
                    onChange={(e) => {
                      setPeriod(e.target.value);
                      setAmount('');
                      setSelectedDay(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {employeeId ? (
            <>
              {/* Employee Header & Status Card */}
              {selected && (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                  <div className="flex items-center gap-3.5">
                    <UserAvatar
                      name={selected.name}
                      avatar={selected.avatar}
                      className="h-12 w-12 rounded-2xl text-sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                          {selected.name}
                        </h2>
                        <Badge tone="default" className="text-[10px] capitalize">
                          {selected.role}
                        </Badge>
                        {selected.employeeId && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            ID: {selected.employeeId}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                        <span>{selected.email}</span>
                        {selected.department && (
                          <>
                            <span>&bull;</span>
                            <span>{selected.department}</span>
                          </>
                        )}
                        {selected.salary?.base ? (
                          <>
                            <span>&bull;</span>
                            <span className="font-semibold text-slate-700">
                              Base: {formatCurrency(selected.salary.base)}/mo
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Payment State Badge */}
                  <div className="flex items-center gap-2">
                    {alreadyPaid ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Salary Disbursed for {period}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span>Pending Review &amp; Disbursal</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4 Analytics KPI Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Working Days</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Calendar className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      {work?.workingDays ?? 0}
                    </span>
                    <span className="text-xs text-slate-500">days logged</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Productive Hours</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <Clock className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      {work?.totalHours ?? 0}h
                    </span>
                    <span className="text-xs text-slate-500">
                      avg{' '}
                      {work?.workingDays
                        ? (Number(work?.totalHours || 0) / Number(work.workingDays)).toFixed(1)
                        : '0'}
                      h/day
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Projects &amp; Tasks</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                      <Target className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      {work?.tasksCompleted ?? 0}
                    </span>
                    <span className="text-xs text-slate-500">
                      / {work?.tasksTotal ?? 0} tasks done
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Attendance Health</span>
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        work?.missingCheckout
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-teal-50 text-teal-700'
                      )}
                    >
                      {work?.missingCheckout ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">
                      {work?.missingCheckout ?? 0}
                    </span>
                    <span className="text-xs text-slate-500">missing check-outs</span>
                  </div>
                </div>
              </div>

              {/* Main 2-Column Section: Heatmap & Projects vs Payment Form */}
              <div className="grid gap-6 xl:grid-cols-12">
                {/* Left Column (8 cols): Interactive Monthly Attendance Heatmap & Projects */}
                <div className="space-y-6 xl:col-span-8">
                  {/* Monthly Attendance Activity Heatmap */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-teal-600" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Monthly Attendance &amp; Activity Heatmap
                          </h3>
                          <span className="rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                            {period}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Click any day cell to inspect precise check-in, check-out, and active duration.
                        </p>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>Less</span>
                        <div className="h-3 w-3 rounded-xs bg-slate-100 border border-slate-200" title="0h" />
                        <div className="h-3 w-3 rounded-xs bg-teal-100" title="< 4h" />
                        <div className="h-3 w-3 rounded-xs bg-teal-300" title="4 - 7h" />
                        <div className="h-3 w-3 rounded-xs bg-teal-600" title="7h+" />
                        <span>More</span>
                      </div>
                    </div>

                    {/* Heatmap Calendar Matrix */}
                    <div className="mt-4">
                      {/* Weekday Labels */}
                      <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center text-[11px] font-semibold text-slate-400 uppercase">
                        <span>Mon</span>
                        <span>Tue</span>
                        <span>Wed</span>
                        <span>Thu</span>
                        <span>Fri</span>
                        <span>Sat</span>
                        <span>Sun</span>
                      </div>

                      {/* Days Grid */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {calendarGrid.map((cell, idx) => {
                          if (!cell.isCurrentMonth) {
                            return (
                              <div
                                key={`empty-${idx}`}
                                className="h-16 rounded-xl border border-transparent bg-slate-50/40 opacity-40"
                              />
                            );
                          }

                          const wd = cell.workData;
                          const mins = wd?.durationMinutes || 0;
                          const isMissing = wd?.status === 'missing_checkout';
                          const isSelected = selectedDay?.date === cell.dateStr;

                          // Heatmap intensity style
                          let bgStyle = 'bg-slate-50 border-slate-200/70 text-slate-500';
                          if (mins > 0 && !isMissing) {
                            if (mins < 240) {
                              bgStyle = 'bg-teal-50 border-teal-200 text-teal-900';
                            } else if (mins < 420) {
                              bgStyle = 'bg-teal-100 border-teal-300 text-teal-900';
                            } else {
                              bgStyle = 'bg-teal-600 border-teal-700 text-white font-semibold';
                            }
                          } else if (isMissing) {
                            bgStyle = 'bg-amber-100 border-amber-300 text-amber-950';
                          }

                          return (
                            <button
                              key={cell.dateStr}
                              type="button"
                              onClick={() => setSelectedDay(wd || { date: cell.dateStr, durationMinutes: 0, status: 'absent' })}
                              className={cn(
                                'group flex h-16 flex-col justify-between rounded-xl border p-2 text-left transition-all hover:scale-[1.02] hover:shadow-xs',
                                bgStyle,
                                isSelected ? 'ring-2 ring-teal-600 ring-offset-1' : ''
                              )}
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold">{cell.dayNumber}</span>
                                {isMissing && (
                                  <AlertCircle className="h-3 w-3 text-amber-700" />
                                )}
                              </div>
                              <div className="text-[10px]">
                                {mins > 0 ? (
                                  <span>{formatHours(mins)}</span>
                                ) : (
                                  <span className="opacity-40">&mdash;</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Day Details Strip */}
                    {selectedDay && (
                      <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/70 p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-teal-700" />
                          <div>
                            <span className="font-bold text-slate-900">{selectedDay.date}</span>
                            <span className="text-slate-500 ml-2">
                              {selectedDay.durationMinutes > 0
                                ? `Worked ${formatHours(selectedDay.durationMinutes)}`
                                : 'No logged activity'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {selectedDay.checkInAt && (
                            <span className="text-slate-600">
                              In: {formatDateTime(selectedDay.checkInAt)}
                            </span>
                          )}
                          {selectedDay.checkOutAt && (
                            <span className="text-slate-600">
                              Out: {formatDateTime(selectedDay.checkOutAt)}
                            </span>
                          )}
                          <Badge tone={statusTone(selectedDay.status)} className="capitalize text-[10px]">
                            {selectedDay.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Projects Completed & Deliverables Section */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-bold text-slate-900">
                          Projects &amp; Deliverables Completed
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500">
                        {work?.projects?.length || 0} active project(s) assigned
                      </span>
                    </div>

                    {/* Projects Grid */}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(work?.projects || []).map((proj) => (
                        <div
                          key={proj._id}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[11px] text-slate-500">
                                {proj.client?.company || 'Internal Workspace'}
                              </div>
                              <h4 className="font-bold text-slate-900 text-xs">{proj.name}</h4>
                            </div>
                            <Badge tone={statusTone(proj.status)} className="capitalize text-[10px]">
                              {proj.status}
                            </Badge>
                          </div>

                          {/* Progress */}
                          <div>
                            <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
                              <span>Milestone Progress</span>
                              <span className="text-teal-700 font-bold">{proj.progress || 0}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-teal-600"
                                style={{ width: `${proj.progress || 0}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                            <span>Budget: {formatCurrency(proj.budget || 0)}</span>
                            <Link
                              to={`/tasks?project=${proj._id}`}
                              className="text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-0.5"
                            >
                              <span>Tasks</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}

                      {(!work?.projects || work.projects.length === 0) && (
                        <div className="col-span-2 py-6 text-center text-xs text-slate-400">
                          No active projects linked to this employee.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Daily Working Logs Table */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
                    <div className="border-b border-slate-100 px-5 py-3.5 text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>Working Days &amp; Timestamps Ledger &mdash; {selected?.name} ({period})</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {work?.days?.length || 0} entries
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200/80">
                          <tr>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Check In</th>
                            <th className="px-4 py-2.5">Check Out</th>
                            <th className="px-4 py-2.5">Duration</th>
                            <th className="px-4 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(work?.days || []).map((d) => (
                            <tr key={d.date} className="hover:bg-slate-50/60 transition">
                              <td className="px-4 py-2.5 font-medium text-slate-900">{d.date}</td>
                              <td className="px-4 py-2.5 text-slate-600">
                                {d.checkInAt ? formatDateTime(d.checkInAt) : '&mdash;'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-600">
                                {d.checkOutAt ? formatDateTime(d.checkOutAt) : '&mdash;'}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-teal-800">
                                {formatHours(d.durationMinutes || 0)}
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge tone={statusTone(d.status)} className="text-[10px] capitalize">
                                  {d.status.replace('_', ' ')}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                          {!workLoading && !(work?.days || []).length && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                No attendance records logged for {period}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column (4 cols): Disburse Salary Action Voucher */}
                <div className="xl:col-span-4">
                  <div className="sticky top-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-900">
                        Disburse Salary &amp; Record Expense
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Approves payroll for {period} and records an official expense under Employee Stipends.
                      </p>
                    </div>

                    {/* Calculated Summary Box */}
                    <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Employee:</span>
                        <span className="font-bold text-slate-900">{selected?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Billing Period:</span>
                        <span className="font-bold text-teal-800">{period}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Working Days / Hours:</span>
                        <span className="font-semibold text-slate-900">
                          {work?.workingDays ?? 0} days &bull; {work?.totalHours ?? 0} hrs
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-teal-200/70 pt-2 text-sm">
                        <span className="font-bold text-slate-900">Payout Amount:</span>
                        <span className="font-extrabold text-teal-900">
                          {formatCurrency(Number(amount || 0))}
                        </span>
                      </div>
                    </div>

                    {/* Salary Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-semibold">Salary Amount (INR) *</Label>
                        {selected?.salary?.base ? (
                          <button
                            type="button"
                            onClick={() => setAmount(String(selected.salary!.base))}
                            className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
                          >
                            Use Base: {formatCurrency(selected.salary.base)}
                          </button>
                        ) : null}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount to pay"
                        disabled={alreadyPaid}
                        className="text-xs"
                      />
                    </div>

                    {/* Optional Notes */}
                    <div>
                      <Label className="text-xs font-semibold">Expense Notes (Optional)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Monthly salary + overtime bonus"
                        rows={3}
                        disabled={alreadyPaid}
                        className="mt-1 text-xs"
                      />
                    </div>

                    {alreadyPaid && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        Already paid for this month ({formatCurrency(work.existingPayroll?.net || 0)}).
                      </div>
                    )}

                    {/* Action Button */}
                    {canManage ? (
                      <Button
                        className="w-full bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs"
                        disabled={pay.isPending || !amount || Number(amount) <= 0 || alreadyPaid}
                        onClick={() => pay.mutate()}
                      >
                        {pay.isPending ? 'Processing...' : 'Save & Record Expense'}
                      </Button>
                    ) : (
                      <p className="text-center text-xs text-slate-400">
                        You do not have permission to disburse salaries.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-2xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mb-3">
                <User className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">No employee selected</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Choose an employee from the dropdown above to inspect their attendance activity heatmap,
                logged working time, completed projects, and calculate salary.
              </p>
            </div>
          )}
        </>
      ) : (
        /* Payroll History Tab */
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-semibold text-slate-700">Filter Period:</Label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Period Total Disbursed:{' '}
              <span className="text-sm font-bold text-slate-900 ml-1">
                {formatCurrency(payrollTotal)}
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Net Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payroll?.items || []).map(
                  (p: {
                    _id: string;
                    period: string;
                    net: number;
                    status: string;
                    notes?: string;
                    employee?: { name?: string; email?: string };
                  }) => (
                    <tr key={p._id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{p.employee?.name}</div>
                        <div className="text-[11px] text-slate-500">{p.employee?.email}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{p.period}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {formatCurrency(p.net)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(p.status)} className="capitalize text-[10px]">
                          {p.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.notes || '&mdash;'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canApprove && ['draft', 'pending_approval'].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approve.mutate(p._id)}
                              className="text-xs"
                            >
                              Approve
                            </Button>
                          )}
                          {p.status === 'approved' && ['ceo', 'finance'].includes(role || '') && (
                            <Button
                              size="sm"
                              onClick={() => disburse.mutate(p._id)}
                              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs"
                            >
                              Disburse
                            </Button>
                          )}
                          {p.status === 'disbursed' && (
                            <Link
                              to="/finance/transactions"
                              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                            >
                              View Expense
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
                {!payroll?.items?.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No payroll records logged for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
