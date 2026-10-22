import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Calendar,
  CreditCard,
  Building2,
  Users,
  Edit2,
  Trash2,
  Eye,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  ExternalLink,
  Scan,
  Sparkles,
  Calculator,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TransactionModal, type TransactionItem } from './TransactionModal';
import { syncFinanceQueries } from '../financeSync';
import { useAuthStore } from '@/stores/auth';

interface Props {
  type: 'revenue' | 'expense';
}

export function IncomeExpenseTab({ type }: Props) {
  const qc = useQueryClient();
  const isCeo = useAuthStore((s) => s.user?.role === 'ceo');

  const isIncome = type === 'revenue';
  const label = isIncome ? 'Income' : 'Expense';
  const labelPlural = isIncome ? 'Income' : 'Expenses';

  // Filters state
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);
  const [viewTransaction, setViewTransaction] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncFinanceQueries(qc);
      toast.success(`${label} ledger refreshed`);
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch dynamic categories
  const { data: categoriesData } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
  });

  const categories = isIncome
    ? categoriesData?.incomeCategories || ['Client Payment', 'Project Revenue', 'Service Revenue', 'Other Income']
    : categoriesData?.expenseCategories || [
        'Software Purchase',
        'Office Expenses',
        'Marketing',
        'Vendor Payment',
        'Internet and Electricity',
        'Equipment Purchase',
        'Travel',
        'Other Expenses',
      ];

  // Fetch transactions from API
  const { data: txData, isLoading } = useQuery({
    queryKey: ['finance-transactions', type, category, status, paymentMethod, dateFilter, startDate, endDate, search, page],
    queryFn: async () => {
      const params: any = {
        type,
        page,
        limit: 25,
      };
      if (category !== 'all') params.category = category;
      if (status !== 'all') params.status = status;
      if (paymentMethod !== 'all') params.paymentMethod = paymentMethod;
      if (search.trim()) params.search = search.trim();

      // Date filtering
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const now = new Date();
        if (dateFilter === 'today') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          params.startDate = start;
        } else if (dateFilter === 'this_week') {
          const d = new Date(now);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          d.setDate(diff);
          d.setHours(0, 0, 0, 0);
          params.startDate = d.toISOString();
        } else if (dateFilter === 'this_month') {
          params.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else if (dateFilter === 'this_year') {
          params.startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        }
      } else if (dateFilter === 'custom') {
        if (startDate) params.startDate = new Date(startDate).toISOString();
        if (endDate) params.endDate = new Date(endDate).toISOString();
      }

      return (await api.get('/finance/transactions', { params })).data.data;
    },
  });

  const items: any[] = txData?.items || [];
  const pagination = txData?.pagination || { total: 0, pages: 1 };
  const totalAmount = txData?.aggregates?.totalAmount ?? items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const totalCount = pagination.total || items.length;

  // Delete / Reversal mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/transactions/${id}`)).data,
    onSuccess: async () => {
      toast.success('Transaction reversed/deleted safely and ledger updated');
      await syncFinanceQueries(qc);
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to reverse transaction');
    },
  });

  const handleExportCSV = async () => {
    try {
      toast.info(`Preparing ${label} CSV export…`);
      const params = new URLSearchParams({ type });
      if (category !== 'all') params.append('category', category);
      if (dateFilter === 'this_month') {
        const now = new Date();
        params.append('startDate', new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
      }
      const res = await api.get(`/finance/transactions/export?${params.toString()}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label}_Transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('CSV downloaded successfully');
    } catch (err: any) {
      toast.error(getErrorMessage(err) || 'Export failed');
    }
  };

  const handlePrintTransaction = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              isIncome
                ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-text)]'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isIncome ? 'bg-[var(--teal)]' : 'bg-rose-500'}`} />
            {labelPlural} ledger
          </span>
          <span className="text-xs text-[var(--fg-secondary)]">
            Period:{' '}
            <span className="font-semibold capitalize text-[var(--fg)]">{dateFilter.replace(/_/g, ' ')}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5 px-3 text-xs" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[var(--brand)]' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync'}
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 px-3 text-xs" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-[var(--teal-border)] px-3 text-xs text-[var(--teal-text)] hover:bg-[var(--teal-soft)]"
            onClick={() => {
              setEditingTransaction(null);
              setAutoOpenScanner(true);
              setModalOpen(true);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Scan
          </Button>
          <Button
            size="sm"
            variant={isIncome ? 'teal' : 'primary'}
            className="h-9 gap-1.5 px-3.5 text-xs font-semibold"
            onClick={() => {
              setEditingTransaction(null);
              setAutoOpenScanner(false);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add {label}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          className={`rounded-[var(--radius)] border bg-gradient-to-br via-white to-white p-4 shadow-[var(--shadow-sm)] ${
            isIncome
              ? 'border-[var(--teal-border)] from-[var(--teal-soft)]'
              : 'border-rose-200 from-rose-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide ${isIncome ? 'text-[var(--teal-text)]' : 'text-rose-700'}`}>
              Total {labelPlural}
            </span>
            {isIncome ? (
              <TrendingUp className="h-4 w-4 text-[var(--teal-text)]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-700" />
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(totalAmount)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)] capitalize">
            {dateFilter.replace(/_/g, ' ')} · verified ledger
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-sky-700">Transactions</span>
            <FileSpreadsheet className="h-4 w-4 text-sky-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{totalCount}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Matching current filters</div>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--purple-border)] bg-gradient-to-br from-[var(--purple-soft)] via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--purple-text)]">Average</span>
            <Calculator className="h-4 w-4 text-[var(--purple-text)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">
            {formatCurrency(totalCount > 0 ? totalAmount / totalCount : 0)}
          </div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Mean {label.toLowerCase()} size</div>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)] lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
          {(['all', 'today', 'this_week', 'this_month', 'this_year', 'custom'] as const).map((period) => (
            <button
              key={period}
              type="button"
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                dateFilter === period
                  ? 'bg-[var(--brand)] text-white shadow-sm'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]'
              }`}
              onClick={() => setDateFilter(period)}
            >
              {period.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-36 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-xs text-[var(--fg-muted)]">to</span>
            <Input
              type="date"
              className="w-36 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        )}

        {/* Secondary filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="w-40">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {/* Payment Method */}
          <div className="w-36">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="all">All Methods</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
            </Select>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 text-[var(--fg-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="pl-9 text-xs"
              placeholder={`Search ${labelPlural.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <TableShell>
        {isLoading && <div className="p-8 text-center text-sm text-[var(--fg-secondary)]">Loading {labelPlural}…</div>}

        {!isLoading && items.length === 0 && (
          <EmptyState
            title={`No ${labelPlural.toLowerCase()} recorded`}
            description={`No transactions found for the selected period and criteria.`}
            action={
              <Button
                onClick={() => {
                  setEditingTransaction(null);
                  setModalOpen(true);
                }}
              >
                + Add First {label}
              </Button>
            }
          />
        )}

        {!isLoading && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title / Reference</th>
                  <th>Category</th>
                  <th>Party</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th className="!text-right">Amount</th>
                  <th>Doc</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => {
                  const party =
                    tx.client?.name ||
                    tx.client?.company ||
                    tx.vendor?.name ||
                    tx.employee?.name ||
                    '—';

                  return (
                    <tr key={tx._id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      {/* Date */}
                      <td>
                        <div className="text-xs font-medium text-[var(--fg-primary)]">{formatDate(tx.date)}</div>
                      </td>

                      {/* Title & Description */}
                      <td>
                        <div className="font-semibold text-xs text-[var(--fg-primary)]">
                          {tx.title || tx.category}
                        </div>
                        {tx.description && (
                          <div className="text-[11px] text-[var(--fg-muted)] truncate max-w-[200px]">
                            {tx.description}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                          {tx.category}
                        </span>
                      </td>

                      {/* Party */}
                      <td>
                        <div className="text-xs text-[var(--fg-secondary)] truncate max-w-[130px]">
                          {party}
                        </div>
                      </td>

                      {/* Method */}
                      <td>
                        <span className="text-xs text-[var(--fg-muted)]">{tx.paymentMethod || '—'}</span>
                      </td>

                      {/* Status */}
                      <td>
                        <Badge tone={statusTone(tx.status)}>{tx.status}</Badge>
                      </td>

                      {/* Amount */}
                      <td className="!text-right font-bold text-sm">
                        <span className={isIncome ? 'text-emerald-400' : 'text-rose-400'}>
                          {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                      </td>

                      {/* Attachment */}
                      <td>
                        {tx.attachment?.url ? (
                          <a
                            href={tx.attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                            title={tx.attachment.name}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>File</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-[var(--fg-muted)]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="!text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            onClick={() => setViewTransaction(tx)}
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isCeo ? (
                            <>
                              <button
                                type="button"
                                className="rounded p-1 text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
                                onClick={() => {
                                  setEditingTransaction(tx);
                                  setModalOpen(true);
                                }}
                                title="Update transaction (CEO)"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-[var(--fg-secondary)] transition-colors hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Delete this ${label.toLowerCase()} of ${formatCurrency(tx.amount)}? Bank balance will be reversed if posted.`
                                    )
                                  ) {
                                    deleteMutation.mutate(tx._id);
                                  }
                                }}
                                title="Delete transaction (CEO)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
            <div>
              Showing page {pagination.page} of {pagination.pages} ({pagination.total} total)
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </TableShell>

      {/* Transaction Modal (Add / Edit) */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialType={type}
        editingTransaction={editingTransaction}
        autoOpenScanner={autoOpenScanner}
      />

      {/* Transaction Details & Printable Receipt Modal */}
      {viewTransaction && (
        <Modal
          open={!!viewTransaction}
          onClose={() => setViewTransaction(null)}
          title={`Transaction Receipt — ${viewTransaction.title || viewTransaction.category}`}
          description={`ID: ${viewTransaction._id}`}
          variant="dialog"
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button variant="outline" size="sm" onClick={handlePrintTransaction}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Print Receipt
              </Button>
              <div className="flex items-center gap-2">
                {viewTransaction.attachment?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(viewTransaction.attachment?.url, '_blank')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Attachment
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setViewTransaction(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 rounded-xl bg-gradient-to-br from-[var(--surface-sunken)] to-transparent border border-[var(--border-subtle)] text-center space-y-1">
              <div className="text-[var(--fg-muted)] text-[11px] uppercase tracking-wider">
                {viewTransaction.type === 'revenue' ? 'Received Amount' : 'Paid Amount'}
              </div>
              <div className={`text-2xl font-black ${viewTransaction.type === 'revenue' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(viewTransaction.amount)}
              </div>
              <div className="text-[11px] text-[var(--fg-secondary)]">
                Status: <span className="font-semibold capitalize">{viewTransaction.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-[var(--fg-muted)]">Date:</span>
                <p className="font-semibold mt-0.5">{formatDate(viewTransaction.date)}</p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Category:</span>
                <p className="font-semibold mt-0.5">{viewTransaction.category}</p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Payment Method:</span>
                <p className="font-semibold mt-0.5">{viewTransaction.paymentMethod || '—'}</p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Bank Account:</span>
                <p className="font-semibold mt-0.5">
                  {viewTransaction.bankAccount?.bankName
                    ? `${viewTransaction.bankAccount.bankName} (${viewTransaction.bankAccount.accountNumber})`
                    : '—'}
                </p>
              </div>
            </div>

            {viewTransaction.description && (
              <div>
                <span className="text-[var(--fg-muted)] block mb-1">Description:</span>
                <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                  {viewTransaction.description}
                </div>
              </div>
            )}

            {viewTransaction.notes && (
              <div>
                <span className="text-[var(--fg-muted)] block mb-1">Notes:</span>
                <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                  {viewTransaction.notes}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
