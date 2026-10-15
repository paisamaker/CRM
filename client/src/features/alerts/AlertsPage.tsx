import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { formatDate, formatDateTime, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

type Note = {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt?: string | null;
  createdAt: string;
};

export function AlertsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'notifications' ? 'notifications' : 'alerts';

  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => (await api.get('/alerts', { params: { limit: 50 } })).data.data,
    enabled: tab === 'alerts',
  });

  const { data: notes } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get('/alerts/notifications', { params: { limit: 50 } })).data.data as {
        items: Note[];
        unread: number;
      },
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => api.patch(`/alerts/${id}`, { status: 'resolved' }),
    onSuccess: () => {
      toast.success('Alert resolved');
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const snooze = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/alerts/${id}`, {
        status: 'snoozed',
        snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Snoozed for 24 hours');
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const run = useMutation({
    mutationFn: async () => api.post('/alerts/run'),
    onSuccess: () => {
      toast.success('Alert engine ran');
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const markRead = useMutation({
    mutationFn: async (payload: { ids?: string[]; all?: boolean }) =>
      api.patch('/alerts/notifications/read', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  function setTab(next: 'alerts' | 'notifications') {
    const p = new URLSearchParams(params);
    if (next === 'notifications') p.set('tab', 'notifications');
    else p.delete('tab');
    setParams(p, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Alerts & Notifications"
        description="System alerts and your personal inbox for tasks, approvals, chat, and more"
        actions={
          tab === 'alerts' && role === 'ceo' ? (
            <Button variant="outline" onClick={() => run.mutate()}>
              Run engine now
            </Button>
          ) : tab === 'notifications' && (notes?.unread || 0) > 0 ? (
            <Button variant="outline" onClick={() => markRead.mutate({ all: true })}>
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-1 w-fit">
        <button
          type="button"
          className={cn(
            'rounded-[6px] px-3 py-1.5 text-sm font-medium transition',
            tab === 'alerts'
              ? 'bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm'
              : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
          )}
          onClick={() => setTab('alerts')}
        >
          Alerts
        </button>
        <button
          type="button"
          className={cn(
            'rounded-[6px] px-3 py-1.5 text-sm font-medium transition',
            tab === 'notifications'
              ? 'bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm'
              : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
          )}
          onClick={() => setTab('notifications')}
        >
          Notifications
          {notes?.unread ? (
            <span className="ml-1.5 rounded-full bg-[var(--danger)] px-1.5 py-0.5 text-[10px] text-white">
              {notes.unread}
            </span>
          ) : null}
        </button>
      </div>

      {tab === 'alerts' ? (
        <div className="space-y-3">
          {(data?.items || []).map(
            (a: {
              _id: string;
              type: string;
              severity: string;
              message: string;
              status: string;
              createdAt: string;
            }) => (
              <Card key={a._id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                    <Badge>{a.type.replace('_', ' ')}</Badge>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </div>
                  <div className="mt-2 text-sm font-medium">{a.message}</div>
                  <div className="mt-1 text-xs text-[var(--fg-muted)]">{formatDate(a.createdAt)}</div>
                </div>
                {a.status === 'open' ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => snooze.mutate(a._id)}>
                      Snooze 24h
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate(a._id)}>
                      Resolve
                    </Button>
                  </div>
                ) : null}
              </Card>
            )
          )}
          {!data?.items?.length ? <Card>No alerts yet. Run the engine or wait for scheduled jobs.</Card> : null}
        </div>
      ) : (
        <div className="space-y-2">
          {(notes?.items || []).map((n) => (
            <button
              key={n._id}
              type="button"
              className={cn(
                'block w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition hover:border-[var(--brand)]/30',
                !n.readAt && 'border-l-2 border-l-[var(--brand)]'
              )}
              onClick={async () => {
                if (!n.readAt) await markRead.mutateAsync({ ids: [n._id] });
                if (n.link) navigate(n.link);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-[var(--fg)]">{n.title}</div>
                    <Badge>{n.type.replace(/_/g, ' ')}</Badge>
                    {!n.readAt ? <Badge tone="brand">unread</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-[var(--fg-secondary)]">{n.message}</div>
                  <div className="mt-1 text-xs text-[var(--fg-muted)]">{formatDateTime(n.createdAt)}</div>
                </div>
              </div>
            </button>
          ))}
          {!notes?.items?.length ? <Card>No notifications yet.</Card> : null}
        </div>
      )}
    </div>
  );
}
