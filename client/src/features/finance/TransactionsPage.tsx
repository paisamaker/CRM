import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, EmptyState, TableShell } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

export function TransactionsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'expense',
    category: role === 'manager' || role === 'employee' ? 'Software Purchase' : 'Operations',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    title: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => (await api.get('/finance/transactions', { params: { limit: 50 } })).data.data,
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/finance/transactions', {
        type: form.type,
        category: form.category,
        amount: Number(form.amount),
        date: form.date,
        notes: form.notes || undefined,
        title: form.title || undefined,
        submitForApproval: role === 'ceo' ? false : form.type === 'expense',
      }),
    onSuccess: () => {
      toast.success(
        role === 'ceo'
          ? 'Transaction added successfully'
          : form.type === 'expense'
          ? 'Expense submitted for CEO approval'
          : 'Transaction recorded'
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transactions-bills'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const categories =
    form.type === 'expense'
      ? data?.categories?.expense || [
          'Software Purchase',
          'Domain',
          'Ads Running',
          'Custom Bill',
          'Operations',
          'Marketing',
          'Other',
        ]
      : data?.categories?.revenue || ['Client Payout', 'Agency Fee'];

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Revenue ledger and expense claims"
        actions={<Button onClick={() => setOpen(true)}>{role === 'employee' ? 'Submit expense' : 'Add transaction'}</Button>}
      />

      <TableShell>
        {isLoading ? <div className="p-6 text-sm text-[var(--fg-secondary)]">Loading…</div> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th className="!text-right">Amount</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((t: {
              _id: string;
              date: string;
              type: string;
              category: string;
              amount: number;
              status: string;
              notes?: string;
            }) => (
              <tr key={t._id}>
                <td>{formatDate(t.date)}</td>
                <td className="capitalize">{t.type}</td>
                <td>{t.category}</td>
                <td className="num font-medium">{formatCurrency(t.amount)}</td>
                <td>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </td>
                <td className="text-[var(--fg-secondary)]">{t.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.items?.length && !isLoading ? (
          <EmptyState title="No transactions" description="Add revenue or submit an expense claim" />
        ) : null}
      </TableShell>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New transaction"
        description="Record a revenue entry or submit an agency expense"
        variant="dialog"
        size="md"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="teal"
              disabled={
                !form.amount ||
                create.isPending ||
                (form.type === 'expense' && form.category === 'Custom Bill' && !form.title.trim() && !form.notes.trim())
              }
              onClick={() => create.mutate()}
            >
              {create.isPending
                ? 'Saving…'
                : role === 'ceo'
                ? 'Add to Transactions'
                : form.type === 'expense'
                ? 'Send to CEO'
                : 'Add to Transactions'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {role !== 'employee' ? (
            <div>
              <Label>Type</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="expense">Expense</option>
                <option value="revenue">Revenue</option>
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          {form.type === 'expense' && form.category === 'Custom Bill' ? (
            <div>
              <Label>Bill title</Label>
              <Input
                placeholder="What is this bill for?"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
          ) : null}
          <div>
            <Label>Amount (INR)</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
