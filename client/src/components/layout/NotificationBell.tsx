import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Video,
  CheckSquare,
  MessageSquare,
  Wallet,
  Info,
  Plane,
  X,
  CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { Button } from '@/components/ui/Button';
import { cn, formatDateTime } from '@/lib/utils';

type Note = {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt?: string | null;
  createdAt: string;
};

function noteIcon(type?: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('meeting')) return Video;
  if (t.includes('leave')) return Plane;
  if (t.includes('chat') || t.includes('message')) return MessageSquare;
  if (t.includes('task') || t.includes('project') || t.includes('approval')) return CheckSquare;
  if (t.includes('payment') || t.includes('payroll') || t.includes('invoice') || t.includes('expense')) {
    return Wallet;
  }
  return Info;
}

function noteTone(type?: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('meeting')) return 'bg-teal-100 text-teal-700';
  if (t.includes('leave')) return 'bg-sky-100 text-sky-800';
  if (t.includes('chat')) return 'bg-sky-100 text-sky-700';
  if (t.includes('payment') || t.includes('payroll')) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get('/alerts/notifications', { params: { limit: 12 } })).data.data as {
        items: Note[];
        unread: number;
      },
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (payload: { ids?: string[]; all?: boolean }) =>
      api.patch('/alerts/notifications/read', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] });
    },
  });

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useEffect(() => {
    const socket = connectSocket();
    const onNote = (payload: {
      title?: string;
      message?: string;
      link?: string;
      type?: string;
    }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] });
      if (!payload?.title) return;
      const isMeeting = (payload.type || '').toLowerCase().includes('meeting');
      toast.message(payload.title, {
        description: payload.message,
        action: payload.link
          ? {
              label: isMeeting ? 'Join' : 'Open',
              onClick: () => navigate(payload.link!),
            }
          : undefined,
      });
    };
    socket.on('notification', onNote);
    return () => {
      socket.off('notification', onNote);
    };
  }, [qc, navigate]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // delay so the opening click doesn't immediately close
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('touchstart', onPointer);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = (data?.items || []).slice(0, 8);
  const unread = data?.unread || 0;

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--orange)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recent notifications"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] flex w-[min(92vw,360px)] max-h-[min(70vh,420px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
        >
          {/* Header with X */}
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--fg)]">Notifications</h2>
                {unread > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--brand)] px-1.5 text-[10px] font-semibold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-[var(--fg-muted)]">
                {unread > 0 ? `${unread} unread` : 'Recent updates'}
              </p>
            </div>

            {unread > 0 ? (
              <button
                type="button"
                className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                onClick={() => markRead.mutate({ all: true })}
                disabled={markRead.isPending}
              >
                Mark all read
              </button>
            ) : null}

            <button
              type="button"
              onClick={close}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--fg-muted)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* Recent list */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-xs text-[var(--fg-muted)]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-5 w-5 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-[var(--fg)]">No notifications</p>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">You’re all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--divider)]">
                {items.map((n) => {
                  const Icon = noteIcon(n.type);
                  const unreadItem = !n.readAt;
                  return (
                    <li key={n._id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-2.5 px-3 py-3 text-left transition hover:bg-[var(--bg-subtle)]',
                          unreadItem && 'bg-[var(--brand-soft)]/60'
                        )}
                        onClick={async () => {
                          if (unreadItem) await markRead.mutateAsync({ ids: [n._id] });
                          close();
                          if (n.link) navigate(n.link);
                          else navigate('/alerts?tab=notifications');
                        }}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            noteTone(n.type)
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-[var(--fg)]">
                              {n.title}
                            </span>
                            {unreadItem ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                            ) : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--fg-secondary)]">
                            {n.message}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
                            {formatDateTime(n.createdAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold text-[var(--fg-secondary)] transition hover:bg-white hover:text-[var(--fg)]"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
            <button
              type="button"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[var(--brand)] text-[12px] font-semibold text-white transition hover:bg-[var(--brand-deep)]"
              onClick={() => {
                close();
                navigate('/alerts?tab=notifications');
              }}
            >
              View all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
