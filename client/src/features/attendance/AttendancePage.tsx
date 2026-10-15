import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  CheckCircle2,
  Clock,
  Percent,
  AlertTriangle,
  Flame,
  Download,
  RefreshCw,
  Calendar,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { PageHeader } from '@/components/ui/Card';
import { AttendanceWidget, isAttendanceExempt } from './AttendanceWidget';
import { AttendanceMetricCard } from './components/AttendanceMetricCard';
import { WorkforceHeatmap } from './components/WorkforceHeatmap';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { EmployeeProfileDrawer } from './components/EmployeeProfileDrawer';
import { DayDetailModal } from './components/DayDetailModal';
import { AttendanceCorrectionModal } from './components/AttendanceCorrectionModal';
import { formatDurationMinutes, formatDateReadable } from './attendanceUtils';
import type { HeatmapResponse, EmployeeDirectoryItem } from './types';

export function AttendancePage() {
  const role = useAuthStore((s) => s.user?.role);
  const user = useAuthStore((s) => s.user);
  const canManage = role === 'ceo' || role === 'manager';
  const exempt = isAttendanceExempt(role);
  const qc = useQueryClient();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [correctRecordId, setCorrectRecordId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Workforce Heatmap Query (Company wide if manager/ceo, personal if employee)
  const {
    data: heatmapData,
    isLoading: isLoadingHeatmap,
    refetch: refetchHeatmap,
  } = useQuery({
    queryKey: ['attendance-heatmap', selectedYear, departmentFilter, canManage ? 'company' : user?.id],
    queryFn: async () => {
      return (
        await api.get('/attendance/analytics/heatmap', {
          params: {
            year: selectedYear,
            department: departmentFilter || undefined,
            userId: canManage ? undefined : user?.id,
          },
        })
      ).data.data as HeatmapResponse;
    },
  });

  // Employee Directory Query (for administrators / managers)
  const {
    data: directoryData = [],
    isLoading: isLoadingDirectory,
    refetch: refetchDirectory,
  } = useQuery({
    queryKey: ['attendance-employee-directory'],
    queryFn: async () => {
      return (await api.get('/attendance/analytics/employee-directory')).data
        .data as EmployeeDirectoryItem[];
    },
    enabled: canManage,
  });

  const summary = heatmapData?.summary;
  const days = heatmapData?.days || {};

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetchHeatmap(),
      canManage ? refetchDirectory() : Promise.resolve(),
      qc.invalidateQueries({ queryKey: ['attendance-today'] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
    toast.success('Attendance records refreshed');
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (!directoryData.length) {
      toast.error('No attendance records available to export');
      return;
    }

    const headers = [
      'Employee Name',
      'Email',
      'Role',
      'Department',
      'Today Status',
      'Today Duration (mins)',
      '30-Day Working Hours',
      'Active Working Days',
      'Attendance Consistency (%)',
      'Missing Checkouts',
    ];

    const rows = directoryData.map((d) => [
      `"${d.user.name}"`,
      `"${d.user.email}"`,
      `"${d.user.role}"`,
      `"${d.user.department || ''}"`,
      `"${d.todayStatus}"`,
      d.todayMinutes,
      d.periodHours,
      d.activeDays,
      `${d.attendanceRate}%`,
      d.missingCheckouts,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `STAR_MEDIA_Workforce_Attendance_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Attendance report exported as CSV');
  };

  return (
    <div className="space-y-6">
      {/* SECTION A: PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-teal-700 tracking-wider uppercase">
              Workforce Operations
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-[11px] font-medium text-slate-500">Attendance Analytics</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Attendance &amp; Workforce Analytics
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {exempt
              ? 'Executive overview of active workforce hours, contribution heatmaps, and staff logs.'
              : 'Record your daily shifts, submit completed work logs, and track activity progress.'}
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <Download className="h-3.5 w-3.5 text-teal-600" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Check-in / Check-out interactive component for non-exempt staff */}
      {!exempt && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <AttendanceWidget />
        </div>
      )}

      {/* SECTION B: COMPACT ANALYTICS METRICS WIDGETS (1 to 6) */}
      {summary && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {canManage ? (
            <>
              <AttendanceMetricCard
                label="Active Employees"
                value={summary.activeEmployeesCount}
                subValue="Non-exempt staff"
                badge="Staff"
                badgeTone="teal"
                icon={Users}
                tooltip="Total count of active team members in organization eligible for daily attendance."
              />

              <AttendanceMetricCard
                label="Present Today"
                value={summary.presentToday}
                subValue={
                  summary.currentlyCheckedIn !== undefined
                    ? `${summary.currentlyCheckedIn} active right now`
                    : 'Checked in today'
                }
                badge="Live"
                badgeTone="emerald"
                icon={CheckCircle2}
                tooltip="Employees who attended today (both currently active and completed shifts)."
              />

              <AttendanceMetricCard
                label="Average Working Hours"
                value={`${summary.averageHoursPerDay}h`}
                subValue="Per active workday"
                badge="Benchmark"
                badgeTone="teal"
                icon={Clock}
                tooltip="Average daily recorded duration across all working sessions in the selected year."
              />

              <AttendanceMetricCard
                label="Attendance Rate"
                value={`${summary.attendanceRate}%`}
                subValue="Working days consistency"
                badge="Annual"
                badgeTone="teal"
                icon={Percent}
                tooltip="Percentage of expected business days where employees completed attendance sessions."
              />

              <AttendanceMetricCard
                label="Missing Check-outs"
                value={summary.missingCheckouts}
                subValue="Unclosed day sessions"
                badge={summary.missingCheckouts > 0 ? 'Requires Audit' : 'Clear'}
                badgeTone={summary.missingCheckouts > 0 ? 'amber' : 'emerald'}
                icon={AlertTriangle}
                tooltip="Sessions where employees checked in but did not submit a checkout with task details."
              />

              <AttendanceMetricCard
                label="Total Logged Hours"
                value={formatDurationMinutes(summary.totalLoggedMinutes)}
                subValue={`${summary.activeWorkingDays} recorded days`}
                badge="Cumulative"
                badgeTone="teal"
                icon={Flame}
                tooltip="Total cumulative working hours recorded across all shifts and work-log items."
              />
            </>
          ) : (
            <>
              <AttendanceMetricCard
                label="My Active Days"
                value={`${summary.activeWorkingDays} days`}
                subValue="Recorded workdays"
                badge="Personal"
                badgeTone="teal"
                icon={Calendar}
                tooltip="Total number of calendar days you have clocked in and worked this year."
              />

              <AttendanceMetricCard
                label="Today's Shift"
                value={
                  summary.presentToday > 0
                    ? summary.currentlyCheckedIn && summary.currentlyCheckedIn > 0
                      ? 'Active'
                      : 'Done'
                    : 'Off Duty'
                }
                subValue={
                  summary.presentToday > 0
                    ? summary.currentlyCheckedIn && summary.currentlyCheckedIn > 0
                      ? 'Currently checked in'
                      : 'Shift completed'
                    : 'Not checked in yet'
                }
                badge={
                  summary.presentToday > 0
                    ? summary.currentlyCheckedIn && summary.currentlyCheckedIn > 0
                      ? 'Live'
                      : 'Complete'
                    : 'Idle'
                }
                badgeTone={summary.presentToday > 0 ? 'emerald' : 'amber'}
                icon={CheckCircle2}
                tooltip="Your personal attendance status for today's workday."
              />

              <AttendanceMetricCard
                label="My Daily Average"
                value={`${summary.averageHoursPerDay}h`}
                subValue="Per active workday"
                badge="Average"
                badgeTone="teal"
                icon={Clock}
                tooltip="Your average recorded working hours per attended workday."
              />

              <AttendanceMetricCard
                label="Attendance Rate"
                value={`${summary.attendanceRate}%`}
                subValue="Consistency score"
                badge="Consistency"
                badgeTone="teal"
                icon={Percent}
                tooltip="Percentage of expected working days you attended this year."
              />

              <AttendanceMetricCard
                label="Unclosed Sessions"
                value={summary.missingCheckouts}
                subValue="Missing check-outs"
                badge={summary.missingCheckouts > 0 ? 'Action Req' : 'All Clear'}
                badgeTone={summary.missingCheckouts > 0 ? 'amber' : 'emerald'}
                icon={AlertTriangle}
                tooltip="Your shifts that were missing a checkout submission."
              />

              <AttendanceMetricCard
                label="My Total Logged Time"
                value={formatDurationMinutes(summary.totalLoggedMinutes)}
                subValue="Cumulative duration"
                badge="Total"
                badgeTone="teal"
                icon={Flame}
                tooltip="Total hours and minutes of work you have recorded this year."
              />
            </>
          )}
        </div>
      )}

      {/* SECTION C: GITHUB-STYLE WORKFORCE ACTIVITY HEATMAP */}
      <WorkforceHeatmap
        year={selectedYear}
        onYearChange={setSelectedYear}
        days={days}
        summary={summary}
        onSelectDate={(date) => setSelectedDate(date)}
        selectedDate={selectedDate}
        employeeName={canManage ? undefined : user?.name}
        isSingleEmployee={!canManage}
        departmentFilter={departmentFilter}
        onDepartmentChange={setDepartmentFilter}
        isLoading={isLoadingHeatmap}
      />

      {/* SECTION D: EMPLOYEE DIRECTORY (FOR MANAGERS & CEO) */}
      {canManage && (
        <EmployeeDirectory
          items={directoryData}
          onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
          isLoading={isLoadingDirectory}
        />
      )}

      {/* MODAL 1: Day Detail Modal when clicking any heatmap cell */}
      <DayDetailModal
        date={selectedDate}
        onClose={() => setSelectedDate(null)}
        onOpenCorrect={(recId) => {
          setSelectedDate(null);
          setCorrectRecordId(recId);
        }}
        canManage={canManage}
      />

      {/* MODAL 2: Employee Profile Drawer when clicking an employee card/row */}
      <EmployeeProfileDrawer
        employeeId={selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
        onOpenCorrect={(recId) => {
          setCorrectRecordId(recId);
        }}
        canManage={canManage}
      />

      {/* MODAL 3: Audit Correction Modal */}
      <AttendanceCorrectionModal
        recordId={correctRecordId}
        onClose={() => setCorrectRecordId(null)}
        onSuccess={() => {
          handleRefresh();
        }}
      />
    </div>
  );
}
