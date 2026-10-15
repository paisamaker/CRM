import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, TableShell } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const tabs = ['pending', 'approved', 'rejected', 'all'] as const;

export function ApprovalsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<(typeof tabs)[number]>('pending');
  const [selected, setSelected] = useState<string[]>([]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', tab],
    queryFn: async () =>
      (
        await api.get('/approvals', {
          params: { status: tab === 'all' ? undefined : tab, limit: 50, sort: '-amount' },
        })
      ).data.data,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/approvals/${id}/approve`),
    onSuccess: () => {
      toast.success('Approved');
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reject = useMutation({
    mutationFn: async () => api.post(`/approvals/${rejectId}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Rejected');
      setRejectId(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const bulk = useMutation({
    mutationFn: async () => api.post('/approvals/bulk', { ids: selected, action: 'approve' }),
    onSuccess: () => {
      toast.success('Bulk approved');
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title={role === 'ceo' ? 'CEO Approvals' : 'My approval requests'}
        description={
          role === 'ceo'
            ? 'Approve client bills, expenses, payroll, and procurement'
            : 'Track bills and requests you sent to the CEO'
        }
        actions={
          role === 'ceo' && selected.length ? (
            <Button onClick={() => bulk.mutate()}>Approve selected ({selected.length})</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-3 py-2 text-sm capitalize ${tab === t ? 'bg-[var(--brand)] text-white' : 'border border-[var(--border)] bg-[var(--bg-elevated)]'}`}
          >
            {t}
            {data?.tabTotals?.[t] ? (
              <span className="ml-2 text-xs opacity-80">{formatCurrency(data.tabTotals[t].amount)}</span>
            ) : null}
          </button>
        ))}
      </div>

      <TableShell>
        {isLoading ? <div className="p-6 text-sm text-[var(--fg-secondary)]">Loading…</div> : null}
        <table className="data-table">
          <thead>
            <tr>
              {role === 'ceo' ? <th></th> : null}
              <th>Request</th>
              <th>Type</th>
              <th className="!text-right">Amount</th>
              <th>Requester</th>
              <th>Status</th>
              <th>Date</th>
              {role === 'ceo' ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((a: {
              _id: string;
              title: string;
              type: string;
              amount: number;
              status: string;
              createdAt: string;
              priority: string;
              requestedBy?: { name?: string };
            }) => (
              <tr key={a._id}>
                {role === 'ceo' ? (
                  <td>
                    {a.status === 'pending' ? (
                      <input
                        type="checkbox"
                        checked={selected.includes(a._id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, a._id] : prev.filter((id) => id !== a._id)
                          )
                        }
                      />
                    ) : null}
                  </td>
                ) : null}
                <td>
                  <div className="font-medium">{a.title}</div>
                  <Badge tone={statusTone(a.priority)} className="mt-1">
                    {a.priority}
                  </Badge>
                </td>
                <td className="capitalize">{a.type.replace('_', ' ')}</td>
                <td className="num font-medium">{formatCurrency(a.amount)}</td>
                <td>{a.requestedBy?.name}</td>
                <td>
                  <Badge tone={statusTone(a.status)}>{a.status.replace('_', ' ')}</Badge>
                </td>
                <td>{formatDate(a.createdAt)}</td>
                {role === 'ceo' ? (
                  <td>
                    {a.status === 'pending' || a.status === 'changes_requested' ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approve.mutate(a._id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectId(a._id)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>

      <Modal
        open={!!rejectId}
        onClose={() => setRejectId(null)}
        title="Reject request"
        description="A reason is required"
        size="sm"
        footer={
          <Button variant="danger" disabled={reason.length < 3} onClick={() => reject.mutate()}>
            Reject
          </Button>
        }
      >
        <Label>Reason</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
