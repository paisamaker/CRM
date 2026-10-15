import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, EmptyState, TableShell } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const MANAGER_EXPENSE_TYPES = [
  { value: 'Software Purchase', label: 'Software purchase', hint: 'Licenses, tools, SaaS one-time buys' },
  { value: 'Domain', label: 'Domain', hint: 'Domain registration or renewal' },
  { value: 'Ads Running', label: 'Ads running', hint: 'Meta, Google, influencer ad spend' },
  { value: 'Custom Bill', label: 'Custom bill', hint: 'Any other expense — describe it yourself' },
] as const;

type BillKind = 'expense' | 'client';
type ExpenseCategory = (typeof MANAGER_EXPENSE_TYPES)[number]['value'];

const emptyExpenseForm = {
  category: 'Software Purchase' as ExpenseCategory,
  title: '',
  notes: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
};

const emptyClientForm = {
  client: '',
  description: 'Campaign services',
  unitPrice: '',
  tax: '',
  dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
};

export function InvoicesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const can = useAuthStore((s) => s.can);
  const canSubmit = role === 'manager' || can('invoices', 'submit');
  const canCollect = role === 'ceo' || role === 'finance';
  const isManager = role === 'manager';
  const qc = useQueryClient();
  const [payId, setPayId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);
  const [billKind, setBillKind] = useState<BillKind>(isManager ? 'expense' : 'client');
  const [listTab, setListTab] = useState<'expense' | 'client'>(isManager ? 'expense' : 'client');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [clientForm, setClientForm] = useState(emptyClientForm);

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/finance/invoices', { params: { limit: 50 } })).data.data,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions-bills'],
    queryFn: async () =>
      (await api.get('/finance/transactions', { params: { limit: 50, type: 'expense' } })).data.data,
    enabled: isManager || listTab === 'expense',
  });

  const { data: clients } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: async () => (await api.get('/clients', { params: { limit: 100 } })).data.data.items,
  });

  const expenseBills = useMemo(() => {
    const items = (transactions?.items || []) as {
      _id: string;
      category: string;
      amount: number;
      date: string;
      status: string;
      notes?: string;
    }[];
    return items.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        b.category.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, statusFilter]);

  const clientBills = useMemo(() => {
    const items = (invoices?.items || []) as {
      _id: string;
      number: string;
      total: number;
      paid: number;
      dueDate: string;
      status: string;
      client?: { name?: string; company?: string };
    }[];
    return items.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        inv.number.toLowerCase().includes(q) ||
        (inv.client?.company || '').toLowerCase().includes(q) ||
        (inv.client?.name || '').toLowerCase().includes(q) ||
        inv.status.toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter]);

  const createExpense = useMutation({
    mutationFn: async (submitForApproval: boolean) =>
      api.post('/finance/transactions', {
        type: 'expense',
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        date: expenseForm.date,
        title:
          expenseForm.category === 'Custom Bill'
            ? expenseForm.title.trim() || expenseForm.notes.trim()
            : expenseForm.title.trim() || expenseForm.category,
        notes: expenseForm.notes.trim() || undefined,
        submitForApproval,
      }),
    onSuccess: (_res, submitForApproval) => {
      toast.success(submitForApproval ? 'Expense bill sent to CEO for approval' : 'Expense bill draft saved');
      setOpen(false);
      setExpenseForm(emptyExpenseForm);
      qc.invalidateQueries({ queryKey: ['transactions-bills'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const submitExpense = useMutation({
    mutationFn: async (id: string) => api.post(`/finance/transactions/${id}/submit-approval`),
    onSuccess: () => {
      toast.success('Expense bill submitted to CEO');
      qc.invalidateQueries({ queryKey: ['transactions-bills'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const createInvoice = useMutation({
    mutationFn: async (submitForApproval: boolean) =>
      api.post('/finance/invoices', {
        client: clientForm.client,
        items: [{ description: clientForm.description, quantity: 1, unitPrice: Number(clientForm.unitPrice) }],
        tax: Number(clientForm.tax || 0),
        discount: 0,
        issueDate: new Date().toISOString(),
        dueDate: clientForm.dueDate,
        status: isManager ? 'draft' : 'sent',
        submitForApproval: isManager ? submitForApproval : undefined,
      }),
    onSuccess: (_res, submitForApproval) => {
      toast.success(
        isManager
          ? submitForApproval
            ? 'Client bill sent to CEO for approval'
            : 'Client bill draft saved'
          : 'Invoice created'
      );
      setOpen(false);
      setClientForm(emptyClientForm);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const submitInvoice = useMutation({
    mutationFn: async (id: string) => api.post(`/finance/invoices/${id}/submit-approval`),
    onSuccess: () => {
      toast.success('Client bill submitted to CEO for approval');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const pay = useMutation({
    mutationFn: async () => api.post(`/finance/invoices/${payId}/payments`, { amount: Number(amount) }),
    onSuccess: () => {
      toast.success('Payment recorded');
      setPayId(null);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['finance-overview'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  async function downloadPdf(id: string, number: string) {
    const res = await api.get(`/finance/invoices/${id}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${number}.pdf`;
    a.click();
  }

  const expenseReady =
    !!expenseForm.amount &&
    (expenseForm.category !== 'Custom Bill' || !!expenseForm.title.trim() || !!expenseForm.notes.trim());
  const clientReady = !!clientForm.client && !!clientForm.unitPrice;
  const saving = createExpense.isPending || createInvoice.isPending;
  const showExpenseTab = isManager || role === 'ceo' || role === 'finance';

  return (
    <div>
      <PageHeader
        title="Bills"
        description={
          isManager
            ? 'Create expense or client bills and send them to the CEO for approval'
            : 'Create, approve, collect, and export client invoices and expense bills'
        }
        actions={
          <Button
            onClick={() => {
              setBillKind(isManager ? 'expense' : 'client');
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New bill
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
          {showExpenseTab ? (
            <button
              type="button"
              className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold ${
                listTab === 'expense' ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--fg-secondary)]'
              }`}
              onClick={() => {
                setListTab('expense');
                setStatusFilter('');
              }}
            >
              Expense bills
            </button>
          ) : null}
          <button
            type="button"
            className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold ${
              listTab === 'client' ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--fg-secondary)]'
            }`}
            onClick={() => {
              setListTab('client');
              setStatusFilter('');
            }}
          >
            Client bills
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <Input
              className="w-52 pl-9"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {listTab === 'expense' ? (
              <>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </>
            ) : (
              <>
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending approval</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="rejected">Rejected</option>
              </>
            )}
          </Select>
        </div>
      </div>

      {listTab === 'expense' && showExpenseTab ? (
        <TableShell>
          {txLoading ? <div className="p-8 text-sm text-[var(--fg-secondary)]">Loading expense bills…</div> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th className="!text-right">Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenseBills.map((bill) => (
                <tr key={bill._id}>
                  <td className="font-medium">{bill.category}</td>
                  <td className="max-w-xs truncate text-[var(--fg-secondary)]">{bill.notes || '—'}</td>
                  <td className="num">{formatCurrency(bill.amount)}</td>
                  <td>{formatDate(bill.date)}</td>
                  <td>
                    <Badge tone={statusTone(bill.status)}>{bill.status.replace('_', ' ')}</Badge>
                  </td>
                  <td>
                    {['draft', 'rejected'].includes(bill.status) ? (
                      <Button size="sm" disabled={submitExpense.isPending} onClick={() => submitExpense.mutate(bill._id)}>
                        Send to CEO
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--fg-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!txLoading && !expenseBills.length ? (
            <EmptyState
              title="No expense bills"
              description="Create software, domain, ads, or custom bills for CEO approval."
              action={<Button onClick={() => { setBillKind('expense'); setOpen(true); }}>New bill</Button>}
            />
          ) : null}
        </TableShell>
      ) : (
        <TableShell>
          {invoicesLoading ? <div className="p-8 text-sm text-[var(--fg-secondary)]">Loading client bills…</div> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill number</th>
                <th>Client</th>
                <th className="!text-right">Amount</th>
                <th className="!text-right">Paid</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientBills.map((inv) => (
                <tr key={inv._id}>
                  <td className="font-medium">{inv.number}</td>
                  <td>{inv.client?.company || inv.client?.name || '—'}</td>
                  <td className="num">{formatCurrency(inv.total)}</td>
                  <td className="num">{formatCurrency(inv.paid)}</td>
                  <td>{formatDate(inv.dueDate)}</td>
                  <td>
                    <Badge tone={statusTone(inv.status)}>{inv.status.replace('_', ' ')}</Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadPdf(inv._id, inv.number)}>
                        PDF
                      </Button>
                      {canSubmit && ['draft', 'rejected'].includes(inv.status) ? (
                        <Button size="sm" disabled={submitInvoice.isPending} onClick={() => submitInvoice.mutate(inv._id)}>
                          Send to CEO
                        </Button>
                      ) : null}
                      {canCollect &&
                      !['paid', 'cancelled', 'draft', 'pending_approval', 'rejected'].includes(inv.status) ? (
                        <Button size="sm" variant="secondary" onClick={() => setPayId(inv._id)}>
                          Record pay
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!invoicesLoading && !clientBills.length ? (
            <EmptyState title="No client bills" description="Create a client invoice to get started." />
          ) : null}
        </TableShell>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isManager ? 'Create bill' : 'Create invoice'}
        description={
          isManager
            ? 'Choose an expense type or client bill, then save a draft or send it to the CEO.'
            : 'Create a client invoice.'
        }
        size="md"
        footer={
          isManager && billKind === 'expense' ? (
            <>
              <Button variant="outline" disabled={!expenseReady || saving} onClick={() => createExpense.mutate(false)}>
                Save draft
              </Button>
              <Button disabled={!expenseReady || saving} onClick={() => createExpense.mutate(true)}>
                {saving ? 'Sending…' : 'Send to CEO'}
              </Button>
            </>
          ) : isManager ? (
            <>
              <Button variant="outline" disabled={!clientReady || saving} onClick={() => createInvoice.mutate(false)}>
                Save draft
              </Button>
              <Button disabled={!clientReady || saving} onClick={() => createInvoice.mutate(true)}>
                {saving ? 'Sending…' : 'Send to CEO'}
              </Button>
            </>
          ) : (
            <Button disabled={!clientReady || saving} onClick={() => createInvoice.mutate(false)}>
              {saving ? 'Creating…' : 'Create invoice'}
            </Button>
          )
        }
      >
        {isManager ? (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(['expense', 'client'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm font-medium transition ${
                  billKind === k
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                    : 'border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--bg)]'
                }`}
                onClick={() => setBillKind(k)}
              >
                {k === 'expense' ? 'Expense bill' : 'Client bill'}
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {isManager && billKind === 'expense' ? (
            <>
              <div>
                <Label required>Expense type</Label>
                <div className="mt-1 space-y-2">
                  {MANAGER_EXPENSE_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={`flex cursor-pointer gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 transition ${
                        expenseForm.category === t.value
                          ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                          : 'border-[var(--border)] hover:bg-[var(--bg)]'
                      }`}
                    >
                      <input
                        type="radio"
                        className="mt-1 accent-[var(--brand)]"
                        checked={expenseForm.category === t.value}
                        onChange={() => setExpenseForm({ ...expenseForm, category: t.value })}
                      />
                      <span>
                        <span className="block text-sm font-medium text-[var(--fg)]">{t.label}</span>
                        <span className="block text-xs text-[var(--fg-muted)]">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label required={expenseForm.category === 'Custom Bill'}>
                  {expenseForm.category === 'Custom Bill' ? 'Bill title' : 'Title (optional)'}
                </Label>
                <Input
                  placeholder={
                    expenseForm.category === 'Custom Bill'
                      ? 'e.g. Office chairs, freelance edit'
                      : `${expenseForm.category} — vendor name`
                  }
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Amount (INR)</Label>
                  <Input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label required>Date</Label>
                  <Input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Details / notes</Label>
                <Textarea
                  placeholder="What is this for? Vendor, period, links…"
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label required>Client</Label>
                <Select
                  value={clientForm.client}
                  onChange={(e) => setClientForm({ ...clientForm, client: e.target.value })}
                >
                  <option value="">Select client</option>
                  {(clients || []).map((c: { _id: string; company: string }) => (
                    <option key={c._id} value={c._id}>
                      {c.company}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Line item</Label>
                <Input
                  value={clientForm.description}
                  onChange={(e) => setClientForm({ ...clientForm, description: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Amount</Label>
                  <Input
                    type="number"
                    value={clientForm.unitPrice}
                    onChange={(e) => setClientForm({ ...clientForm, unitPrice: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tax / GST</Label>
                  <Input
                    type="number"
                    value={clientForm.tax}
                    onChange={(e) => setClientForm({ ...clientForm, tax: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={clientForm.dueDate}
                  onChange={(e) => setClientForm({ ...clientForm, dueDate: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!payId}
        onClose={() => setPayId(null)}
        title="Record payment"
        description="Log a payment against this client invoice."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayId(null)}>
              Cancel
            </Button>
            <Button disabled={!amount || pay.isPending} onClick={() => pay.mutate()}>
              {pay.isPending ? 'Saving…' : 'Save payment'}
            </Button>
          </>
        }
      >
        <Label required>Amount (INR)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Modal>
    </div>
  );
}
