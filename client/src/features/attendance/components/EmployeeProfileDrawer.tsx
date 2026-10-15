import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Calendar,
  Clock,
  Briefcase,
  Mail,
  Shield,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FolderKanban,
  Target,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  Phone,
  DollarSign,
  Layers,
  Award,
  Check,
  Building2,
  AlertCircle,
  FileText,
  Eye,
  ListChecks,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { WorkforceHeatmap } from './WorkforceHeatmap';
import {
  formatDurationMinutes,
  formatTime,
  formatDateReadable,
} from '../attendanceUtils';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import type { DayHeatmapData, HeatmapResponse, DayDetailRecord } from '../types';

interface WorkDay {
  _id?: string;
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  durationMinutes: number;
  status: string;
  workLog?: {
    notes?: string;
    customTasks?: string[];
    selectedTasks?: { title: string; task?: string }[];
  };
  notes?: string;
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

interface WorkSummaryData {
  employee: {
    _id: string;
    name: string;
    email: string;
    role: string;
    employeeId?: string;
    department?: string;
    designation?: string;
    avatar?: string;
    phone?: string;
    salary?: { base?: number };
    joiningDate?: string;
    status?: string;
  };
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
}

interface EmployeeProfileDrawerProps {
  employeeId: string | null;
  onClose: () => void;
  onOpenCorrect?: (recordId: string) => void;
  canManage?: boolean;
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

export function EmployeeProfileDrawer({
  employeeId,
  onClose,
  onOpenCorrect,
  canManage = true,
}: EmployeeProfileDrawerProps) {
  const [activeTab, setActiveTab] = useState<'attendance' | 'projects' | 'history'>('attendance');
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<WorkDay | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showYearHeatmap, setShowYearHeatmap] = useState(false);

  const pastPeriods = useMemo(() => getPastPeriods(4), []);

  // 1. Fetch monthly work, projects & attendance summary
  const { data: workData, isLoading: isLoadingWork } = useQuery({
    queryKey: ['employee-work-summary', employeeId, selectedPeriod],
    queryFn: async () => {
      if (!employeeId) return null;
      return (
        await api.get(`/finance/salaries/${employeeId}/work-summary`, {
          params: { period: selectedPeriod },
        })
      ).data.data as WorkSummaryData;
    },
    enabled: !!employeeId,
  });

  // 2. Fetch employee yearly activity heatmap
  const { data: heatmapData, isLoading: isLoadingHeatmap } = useQuery({
    queryKey: ['attendance-employee-heatmap', employeeId, selectedYear],
    queryFn: async () => {
      if (!employeeId) return null;
      return (
        await api.get('/attendance/analytics/heatmap', {
          params: { userId: employeeId, year: selectedYear },
        })
      ).data.data as HeatmapResponse;
    },
    enabled: !!employeeId,
  });

  // 3. Fetch chronological attendance logs
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['attendance-employee-history', employeeId],
    queryFn: async () => {
      if (!employeeId) return { items: [] };
      return (
        await api.get('/attendance', {
          params: { userId: employeeId, limit: 50 },
        })
      ).data.data as { items: DayDetailRecord[] };
    },
    enabled: !!employeeId,
  });

  const fallbackUser = historyData?.items?.[0]?.user;
  const employee: WorkSummaryData['employee'] | undefined =
    workData?.employee ||
    (fallbackUser
      ? {
          _id: fallbackUser._id,
          name: fallbackUser.name,
          email: fallbackUser.email,
          role: fallbackUser.role,
          employeeId: fallbackUser.employeeId,
          department: fallbackUser.department,
          designation: fallbackUser.designation,
          avatar: fallbackUser.avatar,
          status: 'active',
          phone: '',
        }
      : undefined);
  const summary = heatmapData?.summary;
  const days = heatmapData?.days || {};

  // Monthly Heatmap Calendar calculations
  const calendarGrid = useMemo(() => {
    if (!selectedPeriod) return [];
    const [yearStr, monthStr] = selectedPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0

    const daysMap = new Map<string, WorkDay>();
    (workData?.days || []).forEach((d) => daysMap.set(d.date, d));

    const cells: {
      dayNumber: number;
      dateStr: string;
      workData?: WorkDay;
      isCurrentMonth: boolean;
    }[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ dayNumber: 0, dateStr: '', isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedPeriod}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        workData: daysMap.get(dateStr),
        isCurrentMonth: true,
      });
    }

    return cells;
  }, [selectedPeriod, workData?.days]);

  return (
    <>
      <Modal
        open={!!employeeId}
      onClose={onClose}
      variant="dialog"
      size="full"
      title="Employee Profile, Attendance & Deliverables"
      description="Comprehensive attendance analytics, monthly activity heatmap, projects delivered, and work logs."
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            {canManage && employee && (
              <Link to="/finance/payroll" onClick={onClose}>
                <Button variant="outline" size="sm" className="text-xs">
                  <DollarSign className="mr-1 h-3.5 w-3.5 text-teal-600" />
                  Review in Payroll
                </Button>
              </Link>
            )}
          </div>
          <Button variant="outline" onClick={onClose} className="text-xs">
            Close Profile
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* =========================================================================
            SECTION 1: HERO EMPLOYEE PROFILE HEADER
            ========================================================================= */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
          <div className="flex items-center gap-4">
            <UserAvatar
              name={employee?.name}
              avatar={employee?.avatar}
              className="h-16 w-16 rounded-2xl text-lg shadow-xs"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  {employee?.name || 'Employee Profile'}
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200/60 uppercase">
                  <Shield className="h-3 w-3 text-teal-600" />
                  {employee?.role || 'Employee'}
                </span>
                {employee?.employeeId && (
                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    ID: {employee.employeeId}
                  </span>
                )}
                <Badge
                  tone={employee?.status === 'disabled' ? 'danger' : 'teal'}
                  className="text-[10px] capitalize"
                >
                  {employee?.status || 'Active'}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {employee?.email}
                </span>
                {employee?.department && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                    {employee.department} {employee.designation ? `&bull; ${employee.designation}` : ''}
                  </span>
                )}
                {employee?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {employee.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Summary Pill Badges */}
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-center shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Yearly Consistency
              </span>
              <p className="text-base font-extrabold text-teal-700">
                {summary?.attendanceRate || 0}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-center shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Projects Active
              </span>
              <p className="text-base font-extrabold text-indigo-700">
                {workData?.projectsTotal || 0}
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: TAB NAVIGATION (Monthly Attendance vs Projects Delivered)
            ========================================================================= */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                activeTab === 'attendance'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Calendar className="h-3.5 w-3.5 text-teal-600" />
              <span>Monthly Attendance &amp; Heatmap</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                activeTab === 'projects'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <FolderKanban className="h-3.5 w-3.5 text-indigo-600" />
              <span>
                Projects &amp; Work Done ({workData?.projectsCompleted || 0}/{workData?.projectsTotal || 0})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Clock className="h-3.5 w-3.5 text-teal-600" />
              <span>Daily Timestamp Logs</span>
            </button>
          </div>

          {/* Month Selector Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Period:</span>
            <div className="flex items-center gap-1">
              {pastPeriods.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPeriod(p.id);
                    setSelectedDay(null);
                  }}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-semibold transition border',
                    selectedPeriod === p.id
                      ? 'bg-teal-50 border-teal-300 text-teal-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => {
                  setSelectedPeriod(e.target.value);
                  setSelectedDay(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            TAB 1: MONTHLY ATTENDANCE & HEATMAP
            ========================================================================= */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            {/* KPI Analytics Cards */}
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
                    {workData?.workingDays ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">days logged in {selectedPeriod}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Total Hours</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {workData?.totalHours ?? 0}h
                  </span>
                  <span className="text-xs text-slate-500">
                    avg{' '}
                    {workData?.workingDays
                      ? (Number(workData?.totalHours || 0) / Number(workData.workingDays)).toFixed(1)
                      : '0'}
                    h/day
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Tasks Completed</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {workData?.tasksCompleted ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">
                    / {workData?.tasksTotal ?? 0} assigned
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Missing Check-Outs</span>
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg',
                      workData?.missingCheckout
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-teal-50 text-teal-700'
                    )}
                  >
                    {workData?.missingCheckout ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {workData?.missingCheckout ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">incidents</span>
                </div>
              </div>
            </div>

            {/* Monthly Calendar Activity Heatmap Matrix */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Attendance &amp; Activity Heatmap &mdash; {selectedPeriod}
                    </h4>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Hover and click any day cell to inspect precise check-in, check-out, and active duration.
                  </p>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span>0 hrs</span>
                  <div className="h-3 w-3 rounded-xs bg-slate-100 border border-slate-200" title="0h" />
                  <div className="h-3 w-3 rounded-xs bg-teal-100" title="< 4h" />
                  <div className="h-3 w-3 rounded-xs bg-teal-300" title="4 - 7h" />
                  <div className="h-3 w-3 rounded-xs bg-teal-600" title="7h+" />
                  <span>7h+</span>
                </div>
              </div>

              {/* Matrix Grid */}
              <div className="mt-4">
                <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center text-[11px] font-semibold text-slate-400 uppercase">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>

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
                        onClick={() => {
                          const historyMatch = historyData?.items?.find((r) => r.date === cell.dateStr);
                          const resolved: WorkDay = wd || (historyMatch ? {
                            _id: historyMatch._id,
                            date: historyMatch.date,
                            checkInAt: historyMatch.checkInAt,
                            checkOutAt: historyMatch.checkOutAt,
                            durationMinutes: historyMatch.durationMinutes,
                            status: historyMatch.status,
                            workLog: historyMatch.workLog,
                            notes: historyMatch.notes,
                          } : { date: cell.dateStr, durationMinutes: 0, status: 'absent' });
                          setSelectedDay(resolved);
                          setShowDayModal(true);
                        }}
                        className={cn(
                          'group flex h-16 flex-col justify-between rounded-xl border p-2 text-left transition-all hover:scale-[1.02] hover:shadow-xs',
                          bgStyle,
                          isSelected ? 'ring-2 ring-teal-600 ring-offset-1' : ''
                        )}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold">{cell.dayNumber}</span>
                          {isMissing && <AlertCircle className="h-3 w-3 text-amber-700" />}
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

              {/* Day Details Callout */}
              {selectedDay && (
                <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/80 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-teal-700 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900">{formatDateReadable(selectedDay.date)}</span>
                      <span className="text-slate-600 ml-2">
                        {selectedDay.durationMinutes > 0
                          ? `Total Logged: ${formatHours(selectedDay.durationMinutes)}`
                          : 'No active session recorded'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedDay.checkInAt && (
                      <span className="text-slate-600 hidden sm:inline">
                        In: {formatTime(selectedDay.checkInAt)}
                      </span>
                    )}
                    {selectedDay.checkOutAt && (
                      <span className="text-slate-600 hidden sm:inline">
                        Out: {formatTime(selectedDay.checkOutAt)}
                      </span>
                    )}
                    <Badge tone={statusTone(selectedDay.status)} className="capitalize text-[10px]">
                      {selectedDay.status.replace('_', ' ')}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => setShowDayModal(true)}
                      className="ml-2 flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View Day Details &amp; Work</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Toggle Full Year Heatmap */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Full-Year Activity Heatmap ({selectedYear})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowYearHeatmap(!showYearHeatmap)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  {showYearHeatmap ? 'Collapse View' : 'Expand Full Year'}
                </button>
              </div>

              {showYearHeatmap && (
                <div className="mt-3">
                  <WorkforceHeatmap
                    year={selectedYear}
                    onYearChange={setSelectedYear}
                    days={days}
                    summary={summary}
                    onSelectDate={(date) => {
                      const found = (workData?.days || []).find((d) => d.date === date);
                      const historyMatch = historyData?.items?.find((r) => r.date === date);
                      const resolved: WorkDay = found || (historyMatch ? {
                        _id: historyMatch._id,
                        date: historyMatch.date,
                        checkInAt: historyMatch.checkInAt,
                        checkOutAt: historyMatch.checkOutAt,
                        durationMinutes: historyMatch.durationMinutes,
                        status: historyMatch.status,
                        workLog: historyMatch.workLog,
                        notes: historyMatch.notes,
                      } : { date, durationMinutes: 0, status: 'absent' });
                      setSelectedDay(resolved);
                      setShowDayModal(true);
                    }}
                    employeeName={employee?.name}
                    isSingleEmployee
                    isLoading={isLoadingHeatmap}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: PROJECTS COMPLETED & DELIVERABLES
            ========================================================================= */}
        {activeTab === 'projects' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Assigned Projects &amp; Campaign Deliverables
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Projects where {employee?.name} is an active collaborator or contributor.
                  </p>
                </div>
                <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-800">
                  {workData?.projectsTotal || 0} Projects Active
                </span>
              </div>

              {/* Projects Grid */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(workData?.projects || []).map((proj) => (
                  <div
                    key={proj._id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span>{proj.client?.company || 'Internal Project'}</span>
                          </div>
                          <h5 className="font-bold text-slate-900 text-sm mt-0.5">{proj.name}</h5>
                        </div>
                        <Badge tone={statusTone(proj.status)} className="capitalize text-[10px]">
                          {proj.status}
                        </Badge>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                          <span>Milestone Delivery</span>
                          <span className="text-teal-700 font-bold">{proj.progress || 0}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-teal-600 transition-all duration-500"
                            style={{ width: `${proj.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200/70 pt-2.5 text-xs">
                      <span className="text-slate-500">
                        Budget: <strong className="text-slate-900">{formatCurrency(proj.budget || 0)}</strong>
                      </span>
                      <Link
                        to={`/tasks?project=${proj._id}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-teal-700 font-semibold hover:text-teal-800"
                      >
                        <span>Open Tasks</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}

                {(!workData?.projects || workData.projects.length === 0) && (
                  <div className="col-span-full py-12 text-center text-xs text-slate-400">
                    No active projects assigned to this employee.
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Tasks & Deliverables List */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Workflow Tasks &amp; Milestones ({workData?.tasksCompleted || 0}/{workData?.tasksTotal || 0} Completed)
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Recent tasks assigned on the Jira/Kanban execution board.
                  </p>
                </div>
              </div>

              <div className="mt-3 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {(workData?.tasks || []).map((t) => (
                  <div key={t._id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-md border',
                          t.status === 'completed'
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-slate-300 bg-white text-slate-400'
                        )}
                      >
                        {t.status === 'completed' && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{t.title}</div>
                        {t.project?.name && (
                          <div className="text-[11px] text-slate-500">Project: {t.project.name}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {t.priority && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
                          {t.priority}
                        </span>
                      )}
                      <Badge tone={statusTone(t.status)} className="capitalize text-[10px]">
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}

                {(!workData?.tasks || workData.tasks.length === 0) && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No individual tasks recorded for this period.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: CHRONOLOGICAL TIMESTAMP LOGS
            ========================================================================= */}
        {activeTab === 'history' && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chronological Attendance &amp; Check-out Work Logs
                </h4>
                <p className="text-xs text-slate-500">
                  Audited work sessions with check-in, check-out, duration, and task details.
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {historyData?.items?.length || 0} sessions recorded
              </span>
            </div>

            <div className="mt-3 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {isLoadingHistory ? (
                <p className="py-6 text-center text-xs text-slate-400">Loading history…</p>
              ) : historyData?.items?.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No attendance records found.</p>
              ) : (
                historyData?.items?.map((r) => {
                  const tasks = [
                    ...(r.workLog?.selectedTasks || []).map((t) => t.title),
                    ...(r.workLog?.customTasks || []),
                  ];

                  return (
                    <div key={r._id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {formatDateReadable(r.date)}
                          </span>
                          <Badge tone={statusTone(r.status)} className="text-[10px]">
                            {r.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-teal-800">
                            {formatDurationMinutes(r.durationMinutes)}
                          </span>
                          {canManage && onOpenCorrect && (
                            <button
                              type="button"
                              onClick={() => onOpenCorrect(r._id)}
                              className="flex h-6 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-2.5 w-2.5" />
                              <span>Correct</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>In: {r.checkInAt ? formatTime(r.checkInAt) : '—'}</span>
                        <span>Out: {r.checkOutAt ? formatTime(r.checkOutAt) : 'Missing'}</span>
                        {tasks.length > 0 && (
                          <span className="text-teal-700 font-medium">
                            {tasks.length} task{tasks.length === 1 ? '' : 's'} logged
                          </span>
                        )}
                      </div>

                      {r.workLog?.notes && (
                        <p className="text-xs text-slate-700 bg-slate-50 rounded-lg p-2">
                          {r.workLog.notes}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>

    {/* =========================================================================
        POP-UP MODAL: DAY DETAILS, TIME SPENT & WORK DONE
        ========================================================================= */}
    <Modal
      open={showDayModal && !!selectedDay}
      onClose={() => setShowDayModal(false)}
      title={
        selectedDay
          ? `Day Activity & Work Log — ${formatDateReadable(selectedDay.date)}`
          : 'Day Details'
      }
      description={`Shift timing, hours spent, and deliverables completed for ${employee?.name || 'this employee'}.`}
      size="lg"
      overlayClassName="z-[70]"
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {canManage && selectedDay?._id && onOpenCorrect && (
              <button
                type="button"
                onClick={() => {
                  const id = selectedDay._id;
                  setShowDayModal(false);
                  if (id) onOpenCorrect(id);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                <span>Audit / Correct Shift Record</span>
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDayModal(false)}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      }
    >
      {selectedDay && (() => {
        const tasks = [
          ...(selectedDay.workLog?.selectedTasks || []).map((t) => t.title),
          ...(selectedDay.workLog?.customTasks || []),
        ];
        const notes = selectedDay.workLog?.notes || selectedDay.notes;

        return (
          <div className="space-y-5">
            {/* Top Banner: Employee & Date Status */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={employee?.name}
                  avatar={employee?.avatar}
                  className="h-10 w-10 rounded-xl"
                />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{employee?.name || 'Employee'}</h4>
                  <p className="text-xs text-slate-500">
                    {employee?.designation || employee?.role || 'Staff'}
                    {employee?.department ? ` • ${employee.department}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={statusTone(selectedDay.status)} className="capitalize text-xs font-semibold px-2.5 py-1">
                  {selectedDay.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            {/* Timing & Hours Metrics */}
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-teal-600" />
                <span>Time Spent &amp; Shift Timing</span>
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Total Duration */}
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5">
                  <span className="text-[11px] font-semibold text-teal-800 uppercase tracking-wide">
                    Total Time Spent
                  </span>
                  <p className="mt-1 text-2xl font-black text-teal-950">
                    {formatHours(selectedDay.durationMinutes)}
                  </p>
                  <span className="mt-0.5 block text-[11px] text-teal-700">
                    {selectedDay.durationMinutes > 0 ? 'Active recorded session' : 'Zero hours recorded'}
                  </span>
                </div>

                {/* Clock In */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Clock-In Time
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {selectedDay.checkInAt ? formatTime(selectedDay.checkInAt) : '—'}
                  </p>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {selectedDay.checkInAt ? formatDateTime(selectedDay.checkInAt) : 'No clock-in recorded'}
                  </span>
                </div>

                {/* Clock Out */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Clock-Out Time
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {selectedDay.checkOutAt
                      ? formatTime(selectedDay.checkOutAt)
                      : selectedDay.checkInAt
                      ? 'Missing / Active'
                      : '—'}
                  </p>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {selectedDay.checkOutAt
                      ? formatDateTime(selectedDay.checkOutAt)
                      : selectedDay.checkInAt
                      ? 'Pending checkout submission'
                      : 'No clock-out recorded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Work Done & Deliverables Section */}
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                <span>Work Done On This Day</span>
              </h5>

              {notes || tasks.length > 0 ? (
                <div className="space-y-3">
                  {/* Work Summary / Notes */}
                  {notes && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5">
                        <FileText className="h-3.5 w-3.5 text-teal-600" />
                        <span>Session Work Summary &amp; Notes</span>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                        {notes}
                      </p>
                    </div>
                  )}

                  {/* Assigned CRM Tasks Completed */}
                  {selectedDay.workLog?.selectedTasks && selectedDay.workLog.selectedTasks.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Assigned Tasks Completed ({selectedDay.workLog.selectedTasks.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {selectedDay.workLog.selectedTasks.map((t, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-xs text-emerald-950"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="font-medium">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Logged Work Bullets */}
                  {selectedDay.workLog?.customTasks && selectedDay.workLog.customTasks.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                        <ListChecks className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Custom Logged Tasks &amp; Accomplishments ({selectedDay.workLog.customTasks.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {selectedDay.workLog.customTasks.map((t, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-800"
                          >
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="font-medium">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-700">No work log entries submitted</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {selectedDay.durationMinutes > 0
                      ? 'The employee logged attendance duration for this day, but did not submit written notes or task bullets upon checkout.'
                      : 'No working shift or work deliverables were recorded on this day.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </Modal>
  </>
  );
}
