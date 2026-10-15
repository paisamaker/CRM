import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

export function AuditPage() {
  const { data } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get('/settings/audit-logs', { params: { limit: 50 } })).data.data,
  });

  return (
    <div>
      <PageHeader title="Audit Log" description="Immutable trail of state-changing actions" />
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-xs uppercase text-[var(--fg-muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((log: {
              _id: string;
              createdAt: string;
              action: string;
              entity: string;
              entityId?: string;
              ip?: string;
              actor?: { name?: string; email?: string };
            }) => (
              <tr key={log._id} className="border-b border-[var(--border)]">
                <td className="px-4 py-3">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3">{log.actor?.name || log.actor?.email}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3">
                  {log.entity}
                  {log.entityId ? ` · ${log.entityId.slice(-6)}` : ''}
                </td>
                <td className="px-4 py-3 text-[var(--fg-muted)]">{log.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
