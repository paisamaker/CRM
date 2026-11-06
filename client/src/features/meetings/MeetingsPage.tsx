import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Video,
  Plus,
  Search,
  Users,
  Copy,
  Trash2,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { CreateMeetingModal } from './components/CreateMeetingModal';
import type { MeetingItem, MeetingPerson } from './types';
import './meetings.css';

function hostNameOf(host: MeetingItem['host']): string {
  if (!host) return 'Host';
  if (typeof host === 'string') return 'Host';
  return host.name || 'Host';
}

export function MeetingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  const {
    data: employeesData,
    isLoading: loadingPeople,
    refetch: refetchPeople,
    error: peopleError,
  } = useQuery({
    queryKey: ['meeting-employees', search],
    queryFn: async () => {
      const res = await api.get('/meetings/employees', {
        params: search.trim() ? { search: search.trim() } : undefined,
      });
      const payload = res.data?.data;
      const items = Array.isArray(payload?.items) ? (payload.items as MeetingPerson[]) : [];
      return {
        items,
        onlineCount: Number(payload?.onlineCount) || 0,
        total: Number(payload?.total) || items.length,
      };
    },
  });

  const {
    data: meetings = [],
    isLoading: loadingMeetings,
    refetch: refetchMeetings,
    error: meetingsError,
  } = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await api.get('/meetings');
      const items = res.data?.data?.items;
      return Array.isArray(items) ? (items as MeetingItem[]) : [];
    },
  });

  const employees = employeesData?.items || [];

  useEffect(() => {
    const s = connectSocket();
    const onPong = (p: { onlineIds?: string[] }) => {
      setOnlineIds(Array.isArray(p.onlineIds) ? p.onlineIds.map(String) : []);
    };
    const onPresence = (p: { userId: string; online: boolean }) => {
      const id = String(p.userId || '');
      if (!id) return;
      setOnlineIds((prev) => {
        const set = new Set(prev);
        if (p.online) set.add(id);
        else set.delete(id);
        return [...set];
      });
    };
    s.on('presence:pong', onPong);
    s.on('presence:update', onPresence);
    if (s.connected) s.emit('presence:ping');
    else s.once('connect', () => s.emit('presence:ping'));
    return () => {
      s.off('presence:pong', onPong);
      s.off('presence:update', onPresence);
    };
  }, []);

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/meetings/${id}`)).data,
    onSuccess: () => {
      toast.success('Meeting deleted');
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  const onlineSorted = useMemo(() => {
    return [...employees].sort((a, b) => {
      const ao = a.online || onlineSet.has(String(a._id)) ? 1 : 0;
      const bo = b.online || onlineSet.has(String(b._id)) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [employees, onlineSet]);

  const copyLink = async (code: string) => {
    try {
      const url = `${window.location.origin}/meetings/room/${code}`;
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  useEffect(() => {
    if (peopleError) toast.error(getErrorMessage(peopleError));
  }, [peopleError]);

  useEffect(() => {
    if (meetingsError) toast.error(getErrorMessage(meetingsError));
  }, [meetingsError]);

  return (
    <div className="meetings-page space-y-5 pb-12">
      <header className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
        <div className="bg-[linear-gradient(120deg,#ecfdf5_0%,transparent_40%,#eff6ff_100%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-medium text-[var(--fg-secondary)]">Collaboration</div>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--fg)]">
                <Video className="h-6 w-6 text-teal-700" />
                Meetings
              </h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--fg-secondary)]">
                See who is online, create a meeting, invite teammates, and join a Meet-style video
                call with mute, camera, screen share, chat, reactions, and hand raise.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  void refetchPeople();
                  void refetchMeetings();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  setInviteTarget([]);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New meeting
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="xl:col-span-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                <Users className="h-4 w-4 text-teal-700" /> Employees
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
                {onlineSorted.filter((e) => e.online || onlineSet.has(String(e._id))).length}{' '}
                online · {employeesData?.total ?? onlineSorted.length} total
              </div>
            </div>
          </div>
          <div className="border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
              <Input
                className="h-9 pl-8 text-xs"
                placeholder="Search employees…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto p-2">
            {loadingPeople ? (
              <div className="py-10 text-center text-xs text-[var(--fg-muted)]">Loading team…</div>
            ) : onlineSorted.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--fg-muted)]">No employees found</div>
            ) : (
              onlineSorted.map((e) => {
                const id = String(e._id);
                const on = !!(e.online || onlineSet.has(id));
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        name={e.name || 'User'}
                        avatar={e.avatar}
                        className="h-9 w-9 text-[11px]"
                      />
                      <span
                        className={cn(
                          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
                          on ? 'bg-emerald-500' : 'bg-slate-300'
                        )}
                        title={on ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-[var(--fg)]">
                        {e.name || 'User'}
                      </div>
                      <div className="truncate text-[10px] text-[var(--fg-muted)]">
                        <span className={on ? 'text-emerald-700' : ''}>{on ? 'Online' : 'Offline'}</span>
                        {e.designation || e.role ? ` · ${e.designation || e.role}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 gap-1 px-2 text-[10px]"
                      onClick={() => {
                        setInviteTarget([id]);
                        setCreateOpen(true);
                      }}
                    >
                      <Video className="h-3 w-3" /> Meet
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="xl:col-span-8 space-y-4">
          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="text-xs font-semibold text-[var(--fg)]">Join with a code</div>
              <Input
                className="mt-1"
                placeholder="e.g. ABC234"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </div>
            <Button
              className="gap-1.5"
              disabled={joinCode.trim().length < 4}
              onClick={() => navigate(`/meetings/room/${joinCode.trim()}`)}
            >
              <LogIn className="h-3.5 w-3.5" /> Join
            </Button>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--fg)]">Your meetings</h2>
              <p className="text-[11px] text-[var(--fg-muted)]">
                Live and upcoming meetings you are hosting or invited to
              </p>
            </div>

            {loadingMeetings ? (
              <div className="py-16 text-center text-sm text-[var(--fg-muted)]">Loading meetings…</div>
            ) : meetings.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Video className="mb-3 h-10 w-10 text-teal-600/40" />
                <div className="text-sm font-semibold text-[var(--fg)]">No meetings yet</div>
                <p className="mt-1 max-w-sm text-xs text-[var(--fg-secondary)]">
                  Start a call now, or schedule one for later and invite the team.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> New meeting
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {meetings.map((m) => (
                  <div
                    key={m._id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--fg)]">{m.title || 'Meeting'}</span>
                        <Badge tone={statusTone(m.status)}>{m.status || 'scheduled'}</Badge>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                          {m.code}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--fg-muted)]">
                        Host {hostNameOf(m.host)}
                        {m.scheduledAt ? ` · ${formatDateTime(m.scheduledAt)}` : ''}
                        {m.invitees?.length ? ` · ${m.invitees.length} invited` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-[11px]"
                        onClick={() => void copyLink(m.code)}
                      >
                        <Copy className="h-3 w-3" /> Copy link
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1 text-[11px]"
                        onClick={() => navigate(`/meetings/room/${m.code}`)}
                      >
                        <Video className="h-3 w-3" /> {m.status === 'live' ? 'Join' : 'Open'}
                      </Button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        title="Delete"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: 'Delete meeting?',
                            description: 'This removes the meeting for everyone.',
                            detail: <span className="font-semibold">{m.title}</span>,
                            confirmLabel: 'Delete',
                            tone: 'danger',
                          });
                          if (ok) deleteMeeting.mutate(m._id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-[var(--fg-muted)]">
            Tip: open{' '}
            <Link className="text-teal-700 underline" to="/meetings">
              Meetings
            </Link>{' '}
            anytime from the sidebar. For best video quality use Chrome/Edge and allow camera and
            mic.
          </p>
        </section>
      </div>

      <CreateMeetingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        preselectedIds={inviteTarget}
        onCreated={(m) => {
          if (m.status === 'live') navigate(`/meetings/room/${m.code}`);
        }}
      />
    </div>
  );
}
