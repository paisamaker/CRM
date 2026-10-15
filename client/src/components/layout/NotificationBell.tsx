import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get('/alerts/notifications', { params: { limit: 20 } })).data.data as {
        items: Note[];
        unread: number;
      },
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (payload: { ids?: string[]; all?: boolean }) =>
      api.patch('/alerts/notifications/read', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    const socket = connectSocket();
    const onNote = (payload: { title?: string; message?: string }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (payload?.title) {
        toast.message(payload.title, { description: payload.message });
      }
    };
    socket.on('notification', onNote);
    return () => {
      socket.off('notification', onNote);
    };
  }, [qc]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items = data?.items || [];
  const unread = data?.unread || 0;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unread ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--orange)] px-1 text-[10px] font-bold text-white shadow-xs">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-modal)]">
          <div className="flex items-center justify-between border-b border-[var(--divider)] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[var(--fg)]">Notifications</div>
              <div className="text-xs text-[var(--fg-muted)]">{unread} unread</div>
            </div>
            {unread ? (
              <button
                type="button"
                className="text-xs font-medium text-[var(--brand)] hover:underline"
                onClick={() => markRead.mutate({ all: true })}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <button
                key={n._id}
                type="button"
                className={cn(
                  'block w-full border-b border-[var(--divider)] px-4 py-3 text-left transition hover:bg-[var(--brand-soft)]',
                  !n.readAt && 'bg-[var(--bg)]'
                )}
                onClick={async () => {
                  if (!n.readAt) await markRead.mutateAsync({ ids: [n._id] });
                  setOpen(false);
                  if (n.link) navigate(n.link);
                  else navigate('/alerts?tab=notifications');
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--fg)]">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-[var(--fg-secondary)]">{n.message}</div>
                    <div className="mt-1 text-[11px] text-[var(--fg-muted)]">{formatDateTime(n.createdAt)}</div>
                  </div>
                  {!n.readAt ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" /> : null}
                </div>
              </button>
            ))}
            {!items.length ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--fg-muted)]">No notifications yet</div>
            ) : null}
          </div>
          <button
            type="button"
            className="w-full border-t border-[var(--divider)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            onClick={() => {
              setOpen(false);
              navigate('/alerts?tab=notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
}
