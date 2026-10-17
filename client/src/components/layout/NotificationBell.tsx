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
        <>
          {/* Mobile backdrop for easy outside tap dismiss */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 sm:hidden backdrop-blur-2xs"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-2 top-16 z-50 mt-1 flex max-h-[80dvh] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] sm:max-h-[460px]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-slate-900">Notifications</div>
                <div className="text-xs text-slate-500">{unread} unread notifications</div>
              </div>
              {unread ? (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 hover:underline transition"
                  onClick={() => markRead.mutate({ all: true })}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {items.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  className={cn(
                    'block w-full px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100',
                    !n.readAt && 'bg-teal-50/30'
                  )}
                  onClick={async () => {
                    if (!n.readAt) await markRead.mutateAsync({ ids: [n._id] });
                    setOpen(false);
                    if (n.link) navigate(n.link);
                    else navigate('/alerts?tab=notifications');
                  }}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-slate-900">{n.title}</span>
                        {!n.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" /> : null}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-600 leading-relaxed">{n.message}</div>
                      <div className="mt-1 text-[10px] font-medium text-slate-400">{formatDateTime(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))}
              {!items.length ? (
                <div className="px-4 py-10 text-center text-xs text-slate-500">No notifications yet</div>
              ) : null}
            </div>
            <button
              type="button"
              className="w-full border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-center text-xs font-bold text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition"
              onClick={() => {
                setOpen(false);
                navigate('/alerts?tab=notifications');
              }}
            >
              View all notifications →
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
