import { useMemo, useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock,
  Power,
  CheckCircle2,
  Calendar,
  Briefcase,
  Plus,
  X,
  Sparkles,
  Timer,
  Check,
  ShieldCheck,
  FileText,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Label, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTimeOnly(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** CEO/admin are exempt from personal check-in attendance. */
export function isAttendanceExempt(role?: string | null) {
  return role === 'ceo';
}

type TaskRow = { _id: string; title: string; status?: string; assignees?: { _id: string }[] };

export function AttendanceWidget({ compact = false }: { compact?: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const exempt = isAttendanceExempt(role);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [customTask, setCustomTask] = useState('');
  const [customTasks, setCustomTasks] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Live stopwatch tick
  const [nowMs, setNowMs] = useState(Date.now());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => (await api.get('/attendance/today')).data.data,
    refetchInterval: 30_000,
    enabled: !exempt,
  });

  const record = data?.record as {
    checkInAt?: string;
    checkOutAt?: string;
    durationMinutes?: number;
    status?: string;
    workLog?: {
      notes?: string;
      customTasks?: string[];
      selectedTasks?: { title: string }[];
    };
  } | null;

  const isCheckedIn = !!record?.checkInAt && !record?.checkOutAt;
  const isCheckedOut = !!record?.checkOutAt;
  const canCheckIn = data?.canCheckIn ?? (!record?.checkInAt);

  // Update ticker every second when checked in (pause when checkout modal is open to avoid background re-renders while typing notes)
  useEffect(() => {
    if (!isCheckedIn || checkoutOpen) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCheckedIn, checkoutOpen]);

  // Tasks query for work log checkout
  const { data: tasksData } = useQuery({
    queryKey: ['checkout-tasks', userId],
    queryFn: async () =>
      (
        await api.get('/tasks', {
          params: { limit: 100, assignee: userId },
        })
      ).data.data,
    enabled: checkoutOpen && !!userId,
  });

  const myTasks = useMemo(() => {
    const items = (tasksData?.items || []) as TaskRow[];
    return items.filter((t) => {
      if (!userId) return false;
      if (!t.assignees?.length) return true;
      return t.assignees.some((a) => String(a._id) === String(userId) || String(a) === String(userId));
    });
  }, [tasksData, userId]);

  const checkIn = useMutation({
    mutationFn: async () => api.post('/attendance/check-in'),
    onSuccess: () => {
      toast.success('Shift started! You are now checked in.');
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['dashboard-employee'] });
      qc.invalidateQueries({ queryKey: ['attendance-mine'] });
      qc.invalidateQueries({ queryKey: ['attendance-heatmap'] });
      qc.invalidateQueries({ queryKey: ['attendance-employee-directory'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const checkOut = useMutation({
    mutationFn: async (payload?: { notes?: string; customTasks?: string[]; taskIds?: string[] }) =>
      api.post('/attendance/check-out', {
        notes: payload?.notes ?? (notes.trim() || undefined),
        customTasks: payload?.customTasks ?? customTasks,
        taskIds: payload?.taskIds ?? selectedTaskIds,
      }),
    onSuccess: () => {
      toast.success('Shift completed! Attendance and work log logged.');
      setCheckoutOpen(false);
      setNotes('');
      setCustomTask('');
      setCustomTasks([]);
      setSelectedTaskIds([]);
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['dashboard-employee'] });
      qc.invalidateQueries({ queryKey: ['attendance-mine'] });
      qc.invalidateQueries({ queryKey: ['attendance-team'] });
      qc.invalidateQueries({ queryKey: ['attendance-heatmap'] });
      qc.invalidateQueries({ queryKey: ['attendance-employee-directory'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleCloseCheckout = useCallback(() => {
    if (!checkOut.isPending) setCheckoutOpen(false);
  }, [checkOut.isPending]);

  function handleToggleClick() {
    if (checkIn.isPending || checkOut.isPending) return;

    if (isCheckedIn) {
      // Toggle OFF -> open work log checkout modal
      setCheckoutOpen(true);
    } else if (canCheckIn) {
      // Toggle ON -> check in immediately
      checkIn.mutate();
    } else if (isCheckedOut) {
      toast.info('Today’s shift is already completed. Contact admin if you need a correction.');
    }
  }

  function addCustomTask() {
    const value = customTask.trim();
    if (!value) return;
    if (customTasks.includes(value)) {
      toast.info('Task already added to list');
      return;
    }
    setCustomTasks((prev) => [...prev, value]);
    setCustomTask('');
  }

  function toggleTask(id: string) {
    setSelectedTaskIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Calculate live elapsed time
  const elapsedSecs = useMemo(() => {
    if (!record?.checkInAt) return 0;
    if (record.checkOutAt) return (record.durationMinutes || 0) * 60;
    return Math.max(0, Math.floor((nowMs - new Date(record.checkInAt).getTime()) / 1000));
  }, [record?.checkInAt, record?.checkOutAt, record?.durationMinutes, nowMs]);

  const elapsedHours = Math.floor(elapsedSecs / 3600);
  const elapsedMins = Math.floor((elapsedSecs % 3600) / 60);
  const elapsedRemainingSecs = elapsedSecs % 60;

  // Current Date display
  const currentDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  if (exempt) {
    return (
      <div className="rounded-2xl border border-teal-200/60 bg-gradient-to-r from-teal-50/50 via-white to-slate-50/50 p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Executive Attendance Exemption</h3>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  CEO / ADMIN
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                You are exempt from daily clock-in requirements. Review active employee hours, team heatmaps, and audit logs.
              </p>
            </div>
          </div>
          <Link
            to="/attendance"
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 sm:self-auto transition"
          >
            <span>Team Attendance Hub</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded-md bg-slate-200" />
            <div className="h-3 w-48 rounded-md bg-slate-100" />
          </div>
          <div className="h-8 w-24 rounded-full bg-slate-200" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-rose-700">
            <AlertCircle className="h-4 w-4" />
            <span>Could not load attendance status.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-white p-5 sm:p-6 shadow-xs transition-all">
        {/* TOP ROW: Header, Status Badge & Toggle Switch */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors ${
                isCheckedIn
                  ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                  : isCheckedOut
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isCheckedIn ? (
                <Timer className="h-5 w-5 animate-pulse" />
              ) : isCheckedOut ? (
                <CheckCircle2 className="h-5 w-5 text-teal-400" />
              ) : (
                <Clock className="h-5 w-5" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-slate-900">
                  Daily Shift Attendance
                </h3>

                {/* Status Indicator Badge */}
                {isCheckedIn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/80 shadow-2xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Shift Active
                  </span>
                ) : isCheckedOut ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                    <Check className="h-3 w-3 text-teal-600" />
                    Shift Concluded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Off Duty
                  </span>
                )}
              </div>

              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3 w-3 text-slate-400" />
                <span>{currentDateFormatted}</span>
                <span className="text-slate-300">·</span>
                <span className="font-mono text-[11px] text-slate-400">STAR Server Time</span>
              </p>
            </div>
          </div>

          {/* INTERACTIVE SHIFT TOGGLE SWITCH (ON / OFF) */}
          <div className="flex items-center gap-3 self-start sm:self-auto bg-slate-50/80 border border-slate-200/80 rounded-2xl p-1.5 pl-3.5 shadow-2xs">
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Shift Control
              </div>
              <div
                className={`text-xs font-bold ${
                  isCheckedIn ? 'text-teal-700' : isCheckedOut ? 'text-slate-700' : 'text-slate-500'
                }`}
              >
                {isCheckedIn ? 'Checked In' : isCheckedOut ? 'Shift Done' : 'Checked Out'}
              </div>
            </div>

            {/* Toggle Button */}
            <button
              type="button"
              role="switch"
              aria-checked={isCheckedIn}
              onClick={handleToggleClick}
              disabled={checkIn.isPending || checkOut.isPending || (isCheckedOut && !canCheckIn)}
              title={
                isCheckedIn
                  ? 'Click to Check Out & submit work log'
                  : canCheckIn
                  ? 'Click to Check In and start shift'
                  : 'Today’s shift completed'
              }
              className={`relative inline-flex h-9 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                isCheckedIn
                  ? 'bg-teal-600 shadow-md shadow-teal-600/20'
                  : isCheckedOut
                  ? 'bg-slate-300 cursor-not-allowed opacity-80'
                  : 'bg-slate-300 hover:bg-slate-400'
              } ${checkIn.isPending || checkOut.isPending ? 'opacity-60 cursor-wait' : ''}`}
            >
              <span className="sr-only">Toggle Attendance Check In</span>

              {/* Slider thumb */}
              <span
                className={`pointer-events-none flex h-8 w-8 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isCheckedIn ? 'translate-x-7' : 'translate-x-0'
                }`}
              >
                {checkIn.isPending || checkOut.isPending ? (
                  <span className="h-4 w-4 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
                ) : isCheckedIn ? (
                  <Check className="h-4 w-4 text-teal-600 font-bold" />
                ) : (
                  <Power className="h-4 w-4 text-slate-500" />
                )}
              </span>
            </button>
          </div>
        </div>

        {/* MIDDLE SECTION: Live Stopwatch / Shift Details / Completed Summary */}
        {isCheckedIn ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-12 items-center">
            {/* Live Stopwatch Ticker */}
            <div className="lg:col-span-5 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 via-white to-teal-50/30 p-4">
              <div className="flex items-center justify-between text-xs text-teal-800 font-medium">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-600" />
                  </span>
                  Live Elapsed Working Time
                </span>
                <span className="text-[11px] text-teal-600">Active Session</span>
              </div>

              {/* Big Digital Clock */}
              <div className="mt-2 flex items-baseline gap-1 font-mono">
                <div className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  {String(elapsedHours).padStart(2, '0')}
                </div>
                <span className="text-xl font-bold text-slate-400">:</span>
                <div className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  {String(elapsedMins).padStart(2, '0')}
                </div>
                <span className="text-xl font-bold text-slate-400">:</span>
                <div className="text-3xl font-extrabold tracking-tight text-teal-600 sm:text-4xl">
                  {String(elapsedRemainingSecs).padStart(2, '0')}
                </div>
              </div>

              <div className="mt-1 flex items-center gap-6 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Hours</span>
                <span className="ml-2">Mins</span>
                <span className="ml-2">Secs</span>
              </div>
            </div>

            {/* Shift Details & Actions */}
            <div className="lg:col-span-7 flex flex-col justify-between h-full space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clocked In At</div>
                  <div className="mt-1 text-base font-extrabold text-slate-900">
                    {formatTimeOnly(record?.checkInAt)}
                  </div>
                  <div className="text-[11px] text-teal-600 font-medium mt-0.5">Session Active Today</div>
                </div>

                <div className="rounded-xl border border-teal-100/80 bg-teal-50/40 p-3.5">
                  <div className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider">Working Schedule</div>
                  <div className="mt-1 text-base font-extrabold text-teal-950">
                    Flexible Hours
                  </div>
                  <div className="text-[11px] text-teal-700/80 font-medium mt-0.5">No minimum or maximum time limit</div>
                </div>
              </div>

              {/* Status note & Direct Action */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Session in progress · Clock out anytime</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCheckoutOpen(true)}
                  className="text-xs font-semibold text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 shadow-2xs self-end sm:self-auto"
                >
                  <Power className="mr-1.5 h-3.5 w-3.5 text-rose-500" />
                  Turn Off Shift &amp; Check Out
                </Button>
              </div>
            </div>
          </div>
        ) : isCheckedOut ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">Check In</div>
                <div className="mt-0.5 text-base font-bold text-slate-900">
                  {formatTimeOnly(record?.checkInAt)}
                </div>
                <div className="text-[10px] text-slate-400">Morning Session</div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">Check Out</div>
                <div className="mt-0.5 text-base font-bold text-slate-900">
                  {formatTimeOnly(record?.checkOutAt)}
                </div>
                <div className="text-[10px] text-slate-400">Shift Finalized</div>
              </div>

              <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3.5">
                <div className="text-[11px] font-medium text-teal-700">Total Duration Logged</div>
                <div className="mt-0.5 text-base font-extrabold text-teal-900">
                  {formatDuration(record?.durationMinutes || 0)}
                </div>
                <div className="text-[10px] text-teal-600 font-semibold">Recorded to Admin Ledger</div>
              </div>
            </div>

            {/* Work log review box */}
            {record?.workLog ? (
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <FileText className="h-3.5 w-3.5 text-teal-600" />
                  <span>Submitted Work Log</span>
                </div>

                {record.workLog.notes ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    {record.workLog.notes}
                  </p>
                ) : null}

                {(record.workLog.selectedTasks || []).length ? (
                  <div className="mt-2.5">
                    <span className="text-[11px] font-semibold text-slate-500">Assigned Tasks Completed:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {record.workLog.selectedTasks!.map((t, idx) => (
                        <span
                          key={`s-${idx}`}
                          className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 border border-teal-200/60"
                        >
                          <Check className="h-3 w-3 text-teal-600" />
                          {t.title}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(record.workLog.customTasks || []).length ? (
                  <div className="mt-2">
                    <span className="text-[11px] font-semibold text-slate-500">Custom Logged Items:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {record.workLog.customTasks!.map((t, idx) => (
                        <span
                          key={`c-${idx}`}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          • {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Start Your Daily Work Session</h4>
                <p className="text-[11px] text-slate-500">
                  Flip the shift toggle switch to ON to begin tracking your working hours for today.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="teal"
              disabled={checkIn.isPending}
              onClick={() => checkIn.mutate()}
              className="w-full sm:w-auto text-xs font-semibold shadow-2xs"
            >
              <Power className="mr-1.5 h-3.5 w-3.5" />
              {checkIn.isPending ? 'Starting shift…' : 'Toggle ON / Clock In'}
            </Button>
          </div>
        )}
      </div>

      {/* CHECK OUT & WORK LOG MODAL */}
      <Modal
        open={checkoutOpen}
        onClose={handleCloseCheckout}
        title="Check Out &amp; Log Daily Work"
        description="Conclude your work session. Your recorded hours and work items will be synced with the Admin attendance ledger."
        size="lg"
        preventDismiss={checkOut.isPending}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              disabled={checkOut.isPending}
              onClick={() => setCheckoutOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={checkOut.isPending}
                onClick={() =>
                  checkOut.mutate({
                    notes: 'Standard workday deliverables completed.',
                  })
                }
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                Quick Check Out
              </Button>

              <Button
                variant="teal"
                disabled={checkOut.isPending}
                onClick={() => checkOut.mutate()}
                className="text-xs font-bold shadow-xs"
              >
                {checkOut.isPending ? 'Recording Check Out…' : 'Confirm Check Out'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Current Session Duration preview */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-teal-800">Recorded Working Time</div>
              <div className="text-lg font-extrabold text-teal-950">
                {formatDuration(Math.max(1, Math.round(elapsedSecs / 60)))}
              </div>
            </div>
            <div className="text-right text-[11px] text-teal-700">
              <span>Clocked In: </span>
              <span className="font-bold">{formatTimeOnly(record?.checkInAt)}</span>
            </div>
          </div>

          {/* Work Notes */}
          <div>
            <Label htmlFor="work-notes" className="text-xs font-bold text-slate-800">
              Summary of Work Accomplished
            </Label>
            <p className="text-[11px] text-slate-400 mb-1.5">
              Briefly describe deliverables or progress completed during this shift.
            </p>
            <Textarea
              id="work-notes"
              placeholder="e.g., Completed design review for Q4 campaign, fixed responsive navigation bug, joined client check-in call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>

          {/* Assigned Tasks Selection */}
          {myTasks.length > 0 && (
            <div>
              <Label className="text-xs font-bold text-slate-800">Select Completed / Updated Tasks</Label>
              <p className="text-[11px] text-slate-400 mb-1.5">
                Check any assigned tasks worked on today to attach them to your attendance record.
              </p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                {myTasks.map((t) => {
                  const isChecked = selectedTaskIds.includes(t._id);
                  return (
                    <label
                      key={t._id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-xs transition ${
                        isChecked
                          ? 'bg-teal-50 border border-teal-200/60 font-semibold text-teal-900'
                          : 'bg-white border border-slate-100 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTask(t._id)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="truncate flex-1">{t.title}</span>
                      {t.status && (
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                          {t.status}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Tasks Input */}
          <div>
            <Label className="text-xs font-bold text-slate-800">Custom Work Bullets (Optional)</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="e.g., Prepared pitch deck slides for Star Media"
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTask();
                  }
                }}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCustomTask}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {customTasks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customTasks.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => setCustomTasks((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
