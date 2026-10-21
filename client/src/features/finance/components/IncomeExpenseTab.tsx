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
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TransactionModal, type TransactionItem } from './TransactionModal';

interface Props {
  type: 'revenue' | 'expense';
}

export function IncomeExpenseTab({ type }: Props) {
  const qc = useQueryClient();

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
    onSuccess: () => {
      toast.success('Transaction reversed/deleted safely and ledger updated');
      qc.invalidateQueries({ queryKey: ['finance-transactions'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['finance-dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-reports'] });
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
    <div className="space-y-6">
      {/* ── ACTION TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isIncome ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isIncome ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
            {labelPlural} Ledger
          </span>
          <span className="text-xs text-[var(--fg-muted)]">
            Viewing records for <span className="font-semibold text-[var(--fg-primary)] capitalize">{dateFilter.replace('_', ' ')}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-9 px-3 gap-1.5 whitespace-nowrap"
            onClick={handleExportCSV}
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs h-9 px-3.5 gap-1.5 border-teal-500/40 text-teal-400 hover:bg-teal-500/10 shadow-xs whitespace-nowrap font-medium"
            onClick={() => {
              setEditingTransaction(null);
              setAutoOpenScanner(true);
              setModalOpen(true);
            }}
            title="Scan Bill or Receipt with AI OCR"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>Scan Bill / Receipt</span>
          </Button>

          <Button
            size="sm"
            variant={isIncome ? 'teal' : 'primary'}
            className="text-xs h-9 px-3.5 gap-1.5 shadow-md shadow-teal-500/10 whitespace-nowrap font-semibold"
            onClick={() => {
              setEditingTransaction(null);
              setAutoOpenScanner(false);
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add {label}</span>
          </Button>
        </div>
      </div>

      {/* ── SUMMARY STAT CARDS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={`p-4 rounded-2xl bg-gradient-to-br ${
            isIncome
              ? 'from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20'
              : 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20'
          } border shadow-sm`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
              Total {labelPlural} ({dateFilter.replace('_', ' ')})
            </span>
            {isIncome ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(totalAmount)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">
            Aggregated from verified database records
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400">Total Transactions</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {totalCount}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">
            Matches selected period & category filters
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-400">Average Per Transaction</span>
            <Calculator className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(totalCount > 0 ? totalAmount / totalCount : 0)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">
            Mean {label.toLowerCase()} ticket size
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl">
        {/* Quick Date Filters */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          {(['all', 'today', 'this_week', 'this_month', 'this_year', 'custom'] as const).map((period) => (
            <button
              key={period}
              type="button"
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all capitalize ${
                dateFilter === period
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
              }`}
              onClick={() => setDateFilter(period)}
            >
              {period.replace('_', ' ')}
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

                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            onClick={() => {
                              setEditingTransaction(tx);
                              setModalOpen(true);
                            }}
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            onClick={() => {
                              if (confirm(`Are you sure you want to reverse/delete this ${label.toLowerCase()} of ${formatCurrency(tx.amount)}?`)) {
                                deleteMutation.mutate(tx._id);
                              }
                            }}
                            title="Reverse / Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
