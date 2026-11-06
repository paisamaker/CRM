import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Video,
  CalendarClock,
  Zap,
  Search,
  MicOff,
  Camera,
  Check,
  X,
  Users,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn, formatDateTime } from '@/lib/utils';
import type { MeetingItem, MeetingPerson } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  preselectedIds?: string[];
  onCreated?: (meeting: MeetingItem) => void;
}

type SchedulePreset = '15m' | '30m' | '1h' | 'tomorrow10' | 'tomorrow14' | 'custom';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local `datetime-local` value from a Date */
function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(from: Date, minutes: number) {
  return new Date(from.getTime() + minutes * 60_000);
}

function atTomorrow(hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function resolvePreset(preset: SchedulePreset): string {
  const now = new Date();
  switch (preset) {
    case '15m':
      return toLocalInputValue(addMinutes(now, 15));
    case '30m':
      return toLocalInputValue(addMinutes(now, 30));
    case '1h':
      return toLocalInputValue(addMinutes(now, 60));
    case 'tomorrow10':
      return toLocalInputValue(atTomorrow(10));
    case 'tomorrow14':
      return toLocalInputValue(atTomorrow(14));
    default:
      return toLocalInputValue(addMinutes(now, 30));
  }
}

const PRESETS: { id: SchedulePreset; label: string; hint: string }[] = [
  { id: '15m', label: 'In 15 min', hint: 'Quick huddle' },
  { id: '30m', label: 'In 30 min', hint: 'Soon' },
  { id: '1h', label: 'In 1 hour', hint: 'Later today' },
  { id: 'tomorrow10', label: 'Tomorrow 10:00', hint: 'Morning' },
  { id: 'tomorrow14', label: 'Tomorrow 14:00', hint: 'Afternoon' },
  { id: 'custom', label: 'Pick date & time', hint: 'Custom' },
];

export function CreateMeetingModal({ open, onClose, preselectedIds = [], onCreated }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [startNow, setStartNow] = useState(true);
  const [preset, setPreset] = useState<SchedulePreset>('30m');
  const [scheduledAt, setScheduledAt] = useState('');
  const [muteOnJoin, setMuteOnJoin] = useState(false);
  const [videoOnJoin, setVideoOnJoin] = useState(true);
  const [scheduleError, setScheduleError] = useState('');

  const { data: employees = [], isLoading: loadingPeople } = useQuery({
    queryKey: ['meeting-employees', 'picker'],
    queryFn: async () => {
      const payload = (await api.get('/meetings/employees')).data?.data;
      return Array.isArray(payload?.items) ? (payload.items as MeetingPerson[]) : [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setSearch('');
    setSelected(preselectedIds);
    setStartNow(true);
    setPreset('30m');
    setScheduledAt(resolvePreset('30m'));
    setMuteOnJoin(false);
    setVideoOnJoin(true);
    setScheduleError('');
  }, [open, preselectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? employees.filter(
          (e) =>
            e.name?.toLowerCase().includes(q) ||
            e.email?.toLowerCase().includes(q) ||
            e.department?.toLowerCase().includes(q) ||
            e.role?.toLowerCase().includes(q)
        )
      : [...employees];
    return list.sort((a, b) => {
      const ao = a.online ? 1 : 0;
      const bo = b.online ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [employees, search]);

  const selectedPeople = useMemo(
    () => employees.filter((e) => selected.includes(e._id)),
    [employees, selected]
  );

  const schedulePreview = useMemo(() => {
    if (startNow || !scheduledAt) return null;
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTime(d);
  }, [startNow, scheduledAt]);

  const applyPreset = (next: SchedulePreset) => {
    setPreset(next);
    setScheduleError('');
    if (next !== 'custom') setScheduledAt(resolvePreset(next));
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!startNow) {
        if (!scheduledAt) {
          throw new Error('Pick a date and time for the meeting');
        }
        const when = new Date(scheduledAt);
        if (Number.isNaN(when.getTime())) {
          throw new Error('Invalid schedule date');
        }
        if (when.getTime() < Date.now() - 60_000) {
          throw new Error('Schedule time must be in the future');
        }
      }
      return (
        await api.post('/meetings', {
          title: title.trim() || (startNow ? 'Instant meeting' : 'Scheduled meeting'),
          description: description.trim() || null,
          inviteeIds: selected,
          startNow,
          scheduledAt: !startNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          settings: { muteOnJoin, videoOnJoin, waitingRoom: false },
        })
      ).data.data as MeetingItem;
    },
    onSuccess: (meeting) => {
      if (startNow) {
        toast.success('Meeting started');
      } else {
        toast.success(`Scheduled for ${schedulePreview || 'later'} · ${meeting.code}`, {
          action: {
            label: 'Copy link',
            onClick: () => {
              void navigator.clipboard.writeText(
                `${window.location.origin}/meetings/room/${meeting.code}`
              );
            },
          },
        });
      }
      qc.invalidateQueries({ queryKey: ['meetings'] });
      onCreated?.(meeting);
      onClose();
    },
    onError: (e) => {
      const msg = getErrorMessage(e);
      setScheduleError(msg);
      toast.error(msg);
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSubmit =
    !create.isPending && (startNow || (!!scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime())));

  return (
    <Modal
      open={open}
      onClose={() => !create.isPending && onClose()}
      title="New meeting"
      description="Invite the team, start now, or schedule for later."
      size="lg"
      preventDismiss={create.isPending}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-[var(--fg-muted)]">
            {!startNow && schedulePreview ? (
              <span className="inline-flex items-center gap-1.5 text-teal-800">
                <CalendarClock className="h-3.5 w-3.5" />
                Starts {schedulePreview}
              </span>
            ) : startNow ? (
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                Room opens immediately
              </span>
            ) : (
              <span>Choose when this meeting should start</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={create.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="min-w-[9.5rem] gap-1.5"
              disabled={!canSubmit}
              onClick={() => {
                setScheduleError('');
                create.mutate();
              }}
            >
              {startNow ? <Video className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
              {create.isPending
                ? 'Saving…'
                : startNow
                  ? 'Start meeting'
                  : 'Schedule meeting'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Title</Label>
            <Input
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={startNow ? 'Instant standup' : 'Weekly sync'}
              autoFocus
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea
              className="mt-1.5 min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, links, or context for invitees…"
            />
          </div>
        </div>

        <div>
          <Label className="mb-2 block">When</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                'flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition',
                startNow
                  ? 'border-teal-400 bg-teal-50 shadow-[0_0_0_1px_rgba(45,212,191,0.35)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-slate-300'
              )}
              onClick={() => {
                setStartNow(true);
                setScheduleError('');
              }}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                  startNow ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                )}
              >
                <Zap className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-[var(--fg)]">Start now</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--fg-muted)]">
                  Open the room and invite people in
                </span>
              </span>
            </button>
            <button
              type="button"
              className={cn(
                'flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition',
                !startNow
                  ? 'border-teal-400 bg-teal-50 shadow-[0_0_0_1px_rgba(45,212,191,0.35)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-slate-300'
              )}
              onClick={() => {
                setStartNow(false);
                if (!scheduledAt) setScheduledAt(resolvePreset(preset === 'custom' ? '30m' : preset));
                setScheduleError('');
              }}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                  !startNow ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                )}
              >
                <CalendarClock className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-[var(--fg)]">Schedule</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--fg-muted)]">
                  Pick a time — join when it starts
                </span>
              </span>
            </button>
          </div>

          {!startNow && (
            <div className="mt-3 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                      preset === p.id
                        ? 'border-teal-500 bg-teal-600 text-white'
                        : 'border-[var(--border)] bg-white text-[var(--fg-secondary)] hover:border-teal-300 hover:text-teal-800'
                    )}
                    title={p.hint}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px]">Date & time</Label>
                  <Input
                    className="mt-1"
                    type="datetime-local"
                    min={toLocalInputValue(new Date())}
                    value={scheduledAt}
                    onChange={(e) => {
                      setPreset('custom');
                      setScheduledAt(e.target.value);
                      setScheduleError('');
                    }}
                  />
                </div>
                <div className="flex flex-col justify-end rounded-xl border border-dashed border-teal-200 bg-white px-3 py-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">
                    Starts
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-teal-900">
                    {schedulePreview || 'Choose a time'}
                  </div>
                </div>
              </div>

              {scheduleError ? (
                <p className="text-[11px] font-medium text-rose-600">{scheduleError}</p>
              ) : (
                <p className="text-[11px] text-[var(--fg-muted)]">
                  Invitees get a notification with the meeting code. You can open the room anytime from
                  Meetings.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <Label className="mb-2 block">Join defaults</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMuteOnJoin((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition',
                muteOnJoin
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)]'
              )}
            >
              <MicOff className={cn('h-4 w-4', muteOnJoin ? 'text-amber-700' : 'text-slate-400')} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Mute on join</span>
                <span className="text-[10px] opacity-80">{muteOnJoin ? 'On' : 'Off'}</span>
              </span>
              {muteOnJoin ? <Check className="h-3.5 w-3.5 text-amber-700" /> : null}
            </button>
            <button
              type="button"
              onClick={() => setVideoOnJoin((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition',
                videoOnJoin
                  ? 'border-teal-300 bg-teal-50 text-teal-950'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)]'
              )}
            >
              <Camera className={cn('h-4 w-4', videoOnJoin ? 'text-teal-700' : 'text-slate-400')} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Camera on join</span>
                <span className="text-[10px] opacity-80">{videoOnJoin ? 'On' : 'Off'}</span>
              </span>
              {videoOnJoin ? <Check className="h-3.5 w-3.5 text-teal-700" /> : null}
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-teal-700" />
              Invite employees
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {selected.length}
              </span>
              <span className="font-normal text-[10px] text-[var(--fg-muted)]">
                · get a notification
              </span>
            </Label>
            {selected.length > 0 ? (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--fg-muted)] hover:text-rose-600"
                onClick={() => setSelected([])}
              >
                Clear all
              </button>
            ) : null}
          </div>

          {selectedPeople.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedPeople.map((p) => (
                <span
                  key={p._id}
                  className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 py-0.5 pl-0.5 pr-1.5 text-[11px] font-medium text-teal-900"
                >
                  <UserAvatar name={p.name} avatar={p.avatar} className="h-5 w-5 text-[9px]" />
                  {p.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-teal-100"
                    onClick={() => toggle(p._id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
            <Input
              className="h-9 pl-8 text-xs"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-2 max-h-52 space-y-0.5 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5">
            {loadingPeople ? (
              <div className="px-2 py-8 text-center text-xs text-[var(--fg-muted)]">Loading team…</div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-8 text-center text-xs text-[var(--fg-muted)]">No employees found</div>
            ) : (
              filtered.map((e) => {
                const on = !!e.online;
                const checked = selected.includes(e._id);
                return (
                  <button
                    key={e._id}
                    type="button"
                    onClick={() => toggle(e._id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition',
                      checked ? 'bg-teal-50 ring-1 ring-teal-200' : 'hover:bg-[var(--bg-subtle)]'
                    )}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar name={e.name} avatar={e.avatar} className="h-9 w-9 text-[11px]" />
                      <span
                        className={cn(
                          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
                          on ? 'bg-emerald-500' : 'bg-slate-300'
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-[var(--fg)]">{e.name}</div>
                      <div className="truncate text-[10px] text-[var(--fg-muted)]">
                        <span className={on ? 'font-medium text-emerald-700' : ''}>
                          {on ? 'Online' : 'Offline'}
                        </span>
                        {e.designation || e.role ? ` · ${e.designation || e.role}` : ''}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-md border',
                        checked
                          ? 'border-teal-600 bg-teal-600 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
