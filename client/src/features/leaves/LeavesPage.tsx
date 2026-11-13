import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  X,
  Plus,
  Plane,
  RefreshCw,
  Eye,
  Mail,
  Briefcase,
  Clock3,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { formatDate, formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea, Select } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type LeaveUser = {
  _id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
  department?: string;
  designation?: string;
};

type LeaveItem = {
  _id: string;
  user: LeaveUser | string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decisionNote?: string;
  decidedBy?: LeaveUser | string;
  decidedAt?: string;
  createdAt: string;
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: 'Casual',
  sick: 'Sick',
  earned: 'Earned',
  unpaid: 'Unpaid',
  other: 'Other',
};

const TABS = ['pending', 'approved', 'rejected', 'all'] as const;

function userOf(u?: LeaveItem['user'] | LeaveItem['decidedBy'] | null): LeaveUser | null {
  if (!u) return null;
  if (typeof u === 'string') return { _id: u, name: 'User' };
  return u;
}

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function LeavesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isCeo = role === 'ceo';
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending');
  const [applyOpen, setApplyOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<LeaveItem | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [type, setType] = useState<LeaveType>('casual');
  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState(todayYmd());
  const [singleDay, setSingleDay] = useState(true);
  const [reason, setReason] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['leaves', tab],
    queryFn: async () =>
      (
        await api.get('/leaves', {
          params: {
            status: tab === 'all' ? undefined : tab,
            limit: 50,
            sort: '-createdAt',
          },
        })
      ).data.data as { items: LeaveItem[]; pendingCount?: number },
  });

  const items = data?.items || [];
  const pendingCount = data?.pendingCount || 0;

  const dayCountPreview = useMemo(() => {
    const start = singleDay ? startDate : startDate;
    const end = singleDay ? startDate : endDate || startDate;
    if (!start || end < start) return 1;
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    return Math.max(1, diff);
  }, [startDate, endDate, singleDay]);

  const createLeave = useMutation({
    mutationFn: async () =>
      (
        await api.post('/leaves', {
          type,
          startDate,
          endDate: singleDay ? startDate : endDate || startDate,
          reason: reason.trim(),
        })
      ).data.data as LeaveItem,
    onSuccess: () => {
      toast.success('Leave request submitted to CEO');
      setApplyOpen(false);
      setReason('');
      setType('casual');
      setSingleDay(true);
      setStartDate(todayYmd());
      setEndDate(todayYmd());
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const invalidateLeaveQueries = () => {
    qc.invalidateQueries({ queryKey: ['leaves'] });
    qc.invalidateQueries({ queryKey: ['sidebar-badges'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['attendance-heatmap'] });
    qc.invalidateQueries({ queryKey: ['attendance-personal-heatmap'] });
    qc.invalidateQueries({ queryKey: ['attendance-employee-heatmap'] });
    qc.invalidateQueries({ queryKey: ['attendance-employee-directory'] });
    qc.invalidateQueries({ queryKey: ['attendance-today'] });
    qc.invalidateQueries({ queryKey: ['attendance-employee-today'] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/leaves/${id}/approve`)).data,
    onSuccess: () => {
      toast.success('Leave approved — attendance updated');
      setViewLeave(null);
      invalidateLeaveQueries();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reject = useMutation({
    mutationFn: async () =>
      (await api.post(`/leaves/${rejectId}/reject`, { reason: rejectReason.trim() || undefined })).data,
    onSuccess: () => {
      toast.success('Leave declined');
      setRejectId(null);
      setRejectReason('');
      setViewLeave(null);
      invalidateLeaveQueries();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => (await api.post(`/leaves/${id}/cancel`)).data,
    onSuccess: () => {
      toast.success('Leave request cancelled');
      qc.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5 pb-10">
      <header className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
        <div className="bg-[linear-gradient(120deg,#eff6ff_0%,transparent_45%,#ecfdf5_100%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-medium text-[var(--fg-secondary)]">Workforce</div>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--fg)]">
                <Plane className="h-6 w-6 text-sky-700" />
                Leave Applications
              </h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--fg-secondary)]">
                {isCeo
                  ? 'Review and approve or decline leave requests. Approved leave auto-marks attendance.'
                  : 'Apply for a single day or a date range. The CEO will approve or decline your request.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => void refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              {!isCeo ? (
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => setApplyOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Apply for leave
                </Button>
              ) : pendingCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800">
                  {pendingCount} pending
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-xl px-3 py-2 text-sm capitalize',
              tab === t
                ? 'bg-[var(--brand)] text-white'
                : 'border border-[var(--border)] bg-[var(--bg-elevated)]'
            )}
          >
            {t}
            {t === 'pending' && pendingCount ? (
              <span className="ml-2 text-xs opacity-80">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[var(--fg-muted)]">Loading leave requests…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-sky-600/40" />
            <div className="text-sm font-semibold text-[var(--fg)]">No leave requests</div>
            <p className="mt-1 max-w-sm text-xs text-[var(--fg-secondary)]">
              {isCeo
                ? 'When employees apply for leave, requests appear here for approval.'
                : 'Submit a leave request for a single day or a date range.'}
            </p>
            {!isCeo ? (
              <Button size="sm" className="mt-4 gap-1" onClick={() => setApplyOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Apply for leave
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {items.map((leave) => {
              const u = userOf(leave.user);
              const rangeLabel =
                leave.startDate === leave.endDate
                  ? formatDate(leave.startDate)
                  : `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`;
              return (
                <div
                  key={leave._id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left transition hover:bg-[var(--bg-subtle)] -mx-1 px-1 py-1"
                    onClick={() => setViewLeave(leave)}
                  >
                    {isCeo && u ? (
                      <UserAvatar name={u.name} avatar={u.avatar} className="h-10 w-10 text-xs" />
                    ) : (
                      <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isCeo && u ? (
                          <span className="font-semibold text-[var(--fg)]">{u.name}</span>
                        ) : (
                          <span className="font-semibold text-[var(--fg)]">
                            {LEAVE_TYPE_LABELS[leave.type]} leave
                          </span>
                        )}
                        <Badge tone={statusTone(leave.status)}>{leave.status}</Badge>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {LEAVE_TYPE_LABELS[leave.type]}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--fg-muted)]">
                        {rangeLabel}
                        <span className="mx-1.5">·</span>
                        {leave.days} day{leave.days > 1 ? 's' : ''}
                        {u?.department || u?.designation ? (
                          <>
                            <span className="mx-1.5">·</span>
                            {u.designation || u.department}
                          </>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--fg-secondary)]">{leave.reason}</p>
                      {leave.decisionNote ? (
                        <p className="mt-1 text-[11px] text-slate-500">Note: {leave.decisionNote}</p>
                      ) : null}
                    </div>
                  </button>

                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-[11px]"
                      onClick={() => setViewLeave(leave)}
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                    {isCeo && leave.status === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-[11px]"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(leave._id)}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-[11px] text-rose-700"
                          onClick={() => {
                            setRejectId(leave._id);
                            setRejectReason('');
                          }}
                        >
                          <X className="h-3.5 w-3.5" /> Decline
                        </Button>
                      </>
                    ) : null}
                    {!isCeo && leave.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px]"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: 'Cancel leave request?',
                            description: 'This withdraws your pending application.',
                            confirmLabel: 'Cancel request',
                            tone: 'danger',
                          });
                          if (ok) cancel.mutate(leave._id);
                        }}
                      >
                        Cancel request
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={applyOpen}
        onClose={() => !createLeave.isPending && setApplyOpen(false)}
        title="Apply for leave"
        description="Choose a single day or a date range. Working days are counted for the total."
        size="md"
        preventDismiss={createLeave.isPending}
        footer={
          <>
            <Button
              variant="outline"
              disabled={createLeave.isPending}
              onClick={() => setApplyOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="gap-1.5"
              disabled={createLeave.isPending || reason.trim().length < 3}
              onClick={() => createLeave.mutate()}
            >
              <Plane className="h-3.5 w-3.5" />
              {createLeave.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <Label>Leave type</Label>
            <Select
              className="mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
            >
              {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                'rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold transition',
                singleDay
                  ? 'border-sky-400 bg-sky-50 text-sky-900'
                  : 'border-[var(--border)] hover:border-slate-300'
              )}
              onClick={() => {
                setSingleDay(true);
                setEndDate(startDate);
              }}
            >
              Single day
            </button>
            <button
              type="button"
              className={cn(
                'rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold transition',
                !singleDay
                  ? 'border-sky-400 bg-sky-50 text-sky-900'
                  : 'border-[var(--border)] hover:border-slate-300'
              )}
              onClick={() => setSingleDay(false)}
            >
              Date range
            </button>
          </div>

          <div className={cn('grid gap-3', singleDay ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            <div>
              <Label>{singleDay ? 'Date' : 'From'}</Label>
              <Input
                className="mt-1"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (singleDay || endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            {!singleDay ? (
              <div>
                <Label>To</Label>
                <Input
                  className="mt-1"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-[11px] text-sky-900">
            Calendar span: <strong>{dayCountPreview}</strong> day{dayCountPreview > 1 ? 's' : ''}{' '}
            (working-day total is calculated on submit; Sundays & company holidays are skipped)
          </div>

          <div>
            <Label>Reason</Label>
            <Textarea
              className="mt-1 min-h-[88px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason for leave…"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!viewLeave}
        onClose={() => setViewLeave(null)}
        title="Leave application"
        description={
          isCeo
            ? 'Review employee details and leave dates before you approve or decline.'
            : 'Full details of your leave request.'
        }
        size="md"
        footer={
          viewLeave ? (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setViewLeave(null)}>
                Close
              </Button>
              {isCeo && viewLeave.status === 'pending' ? (
                <>
                  <Button
                    variant="outline"
                    className="gap-1 text-rose-700"
                    onClick={() => {
                      setRejectId(viewLeave._id);
                      setRejectReason('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </Button>
                  <Button
                    className="gap-1"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(viewLeave._id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {approve.isPending ? 'Approving…' : 'Approve leave'}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null
        }
      >
        {viewLeave ? (
          <div className="space-y-4 text-sm">
            {(() => {
              const u = userOf(viewLeave.user);
              const decided = userOf(viewLeave.decidedBy);
              const rangeLabel =
                viewLeave.startDate === viewLeave.endDate
                  ? formatDate(viewLeave.startDate)
                  : `${formatDate(viewLeave.startDate)} → ${formatDate(viewLeave.endDate)}`;
              return (
                <>
                  <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                    <UserAvatar
                      name={u?.name || 'User'}
                      avatar={u?.avatar}
                      className="h-12 w-12 text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-[var(--fg)]">{u?.name || 'Employee'}</span>
                        <Badge tone={statusTone(viewLeave.status)}>{viewLeave.status}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--fg-muted)]">
                        {u?.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {u.email}
                          </span>
                        ) : null}
                        {u?.role ? (
                          <span className="inline-flex items-center gap-1 capitalize">
                            <Briefcase className="h-3 w-3" /> {u.role}
                          </span>
                        ) : null}
                        {u?.designation || u?.department ? (
                          <span>{u.designation || u.department}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--border)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                        Leave type
                      </div>
                      <div className="mt-1 font-semibold text-[var(--fg)]">
                        {LEAVE_TYPE_LABELS[viewLeave.type]}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                        Duration
                      </div>
                      <div className="mt-1 font-semibold text-[var(--fg)]">
                        {viewLeave.days} working day{viewLeave.days > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] p-3 sm:col-span-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                        Dates
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-semibold text-[var(--fg)]">
                        <CalendarDays className="h-4 w-4 text-sky-700" />
                        {rangeLabel}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                      Reason
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg)]">
                      {viewLeave.reason}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" /> Applied {formatDateTime(viewLeave.createdAt)}
                    </span>
                    {viewLeave.decidedAt ? (
                      <span>
                        Decided {formatDateTime(viewLeave.decidedAt)}
                        {decided?.name ? ` by ${decided.name}` : ''}
                      </span>
                    ) : null}
                  </div>

                  {viewLeave.decisionNote ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      <span className="font-semibold">Decision note:</span> {viewLeave.decisionNote}
                    </div>
                  ) : null}

                  {isCeo && viewLeave.status === 'pending' ? (
                    <p className="text-[11px] text-[var(--fg-muted)]">
                      Approving will mark these working days as leave on the attendance chart.
                    </p>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!rejectId}
        onClose={() => !reject.isPending && setRejectId(null)}
        title="Decline leave"
        description="Optionally tell the employee why the request was declined."
        size="sm"
        preventDismiss={reject.isPending}
        footer={
          <>
            <Button variant="outline" disabled={reject.isPending} onClick={() => setRejectId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {reject.isPending ? 'Declining…' : 'Decline leave'}
            </Button>
          </>
        }
      >
        <div>
          <Label>Reason (optional)</Label>
          <Textarea
            className="mt-1 min-h-[80px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Peak delivery week — please pick another date"
          />
        </div>
      </Modal>
    </div>
  );
}
