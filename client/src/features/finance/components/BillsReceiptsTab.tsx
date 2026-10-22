import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Edit2,
  Trash2,
  Eye,
  FileCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { BillModal, type BillItem } from './BillModal';
import { RecordBillPaymentModal } from './RecordBillPaymentModal';
import { syncFinanceQueries } from '../financeSync';

export function BillsReceiptsTab() {
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<'all' | 'payable' | 'receivable'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [autoOpenScanner, setAutoOpenScanner] = useState(false);
  const [editingBill, setEditingBill] = useState<BillItem | null>(null);
  const [initialType, setInitialType] = useState<'payable' | 'receivable'>('payable');

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<BillItem | null>(null);

  const [viewBill, setViewBill] = useState<BillItem | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncFinanceQueries(qc);
      toast.success('Bills & invoices ledger synchronized');
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch Bills from API
  const { data: billsData, isLoading } = useQuery({
    queryKey: ['finance-bills', typeFilter, statusFilter, search, page],
    queryFn: async () => {
      const params: any = { page, limit: 30 };
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      return (await api.get('/finance/bills', { params })).data.data;
    },
  });

  const bills: BillItem[] = billsData?.items || [];
  const pagination = billsData?.pagination;

  // Delete / Cancel mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/bills/${id}`)).data,
    onSuccess: async () => {
      toast.success('Bill cancelled/deleted safely');
      await syncFinanceQueries(qc);
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to delete bill');
    },
  });

  // Calculate metrics
  const totalPayableOutstanding = bills
    .filter((b) => b.type === 'payable' && b.paymentStatus !== 'paid' && b.paymentStatus !== 'cancelled')
    .reduce((sum, b) => sum + (Number(b.outstandingAmount) || 0), 0);

  const totalReceivableOutstanding = bills
    .filter((b) => b.type === 'receivable' && b.paymentStatus !== 'paid' && b.paymentStatus !== 'cancelled')
    .reduce((sum, b) => sum + (Number(b.outstandingAmount) || 0), 0);

  const openNewBill = (type: 'payable' | 'receivable' = 'payable', scan = false) => {
    setEditingBill(null);
    setInitialType(type);
    setAutoOpenScanner(scan);
    setBillModalOpen(true);
  };

  const openEditBill = (bill: BillItem) => {
    setEditingBill(bill);
    setInitialType(bill.type);
    setAutoOpenScanner(false);
    setBillModalOpen(true);
  };

  const openPayment = (bill: BillItem) => {
    setSelectedBillForPayment(bill);
    setPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Stat Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-rose-300">Outstanding Payables (Bills to Pay)</div>
            <div className="text-2xl font-bold mt-1 text-[var(--fg-primary)]">
              {formatCurrency(totalPayableOutstanding)}
            </div>
            <div className="text-[11px] text-[var(--fg-muted)] mt-1">Pending vendor & service obligations</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs gap-1"
            onClick={() => openNewBill('payable')}
          >
            <Plus className="w-3.5 h-3.5" /> + Bill
          </Button>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-emerald-300">Outstanding Receivables (Due from Clients)</div>
            <div className="text-2xl font-bold mt-1 text-[var(--fg-primary)]">
              {formatCurrency(totalReceivableOutstanding)}
            </div>
            <div className="text-[11px] text-[var(--fg-muted)] mt-1">Pending income collections</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-xs gap-1"
            onClick={() => openNewBill('receivable')}
          >
            <Plus className="w-3.5 h-3.5" /> + Invoice
          </Button>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-blue-300">Total Bills Recorded</div>
            <div className="text-2xl font-bold mt-1 text-[var(--fg-primary)]">
              {pagination?.total ?? bills.length}
            </div>
            <div className="text-[11px] text-[var(--fg-muted)] mt-1">Payable & Receivable records</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1 whitespace-nowrap"
              onClick={handleSync}
              disabled={isSyncing}
              title="Instantly refresh bills ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-teal-400' : ''}`} />
              <span>{isSyncing ? 'Syncing…' : 'Sync'}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 shadow-sm"
              onClick={() => openNewBill('payable', true)}
              title="Scan Vendor Bill or Invoice with AI OCR"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" /> Scan Bill
            </Button>
            <Button
              size="sm"
              variant="teal"
              className="text-xs gap-1 shadow-md shadow-teal-500/10"
              onClick={() => openNewBill('payable', false)}
            >
              <Plus className="w-4 h-4" /> Create Bill
            </Button>
          </div>
        </div>
      </div>

      {/* Filter / Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter Pills */}
          <div className="flex items-center p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                typeFilter === 'all'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
              }`}
              onClick={() => setTypeFilter('all')}
            >
              All Types
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                typeFilter === 'payable'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
              }`}
              onClick={() => setTypeFilter('payable')}
            >
              Payable (Bills)
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                typeFilter === 'receivable'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
              }`}
              onClick={() => setTypeFilter('receivable')}
            >
              Receivable (Invoices)
            </button>
          </div>

          {/* Status Dropdown */}
          <div className="w-36">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[var(--fg-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            className="pl-9 text-xs"
            placeholder="Search by title, bill #, vendor or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bills & Invoices Table */}
      <TableShell>
        {isLoading && <div className="p-8 text-center text-sm text-[var(--fg-secondary)]">Loading bills & receipts…</div>}

        {!isLoading && bills.length === 0 && (
          <EmptyState
            title="No bills found"
            description="Create custom payable or receivable bills to start tracking balances and receipts."
            action={<Button onClick={() => openNewBill('payable')}>+ Create First Bill</Button>}
          />
        )}

        {!isLoading && bills.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left">
              <thead>
                <tr>
                  <th>Bill / Invoice</th>
                  <th>Type</th>
                  <th>Party / Vendor</th>
                  <th>Category</th>
                  <th>Date & Due</th>
                  <th className="!text-right">Total</th>
                  <th className="!text-right">Outstanding</th>
                  <th>Status</th>
                  <th>Doc</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const party = bill.type === 'receivable' ? bill.clientName || 'Client' : bill.vendorName || 'Vendor';
                  const outstanding = Number(bill.outstandingAmount) || 0;
                  const total = Number(bill.totalAmount) || 0;

                  return (
                    <tr key={bill._id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      {/* Bill details */}
                      <td>
                        <div className="font-semibold text-[var(--fg-primary)] flex items-center gap-1.5">
                          {bill.title}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--fg-muted)]">{bill.billNumber}</div>
                      </td>

                      {/* Type */}
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            bill.type === 'payable'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {bill.type === 'payable' ? 'Payable' : 'Receivable'}
                        </span>
                      </td>

                      {/* Party */}
                      <td>
                        <div className="text-xs font-medium text-[var(--fg-primary)] truncate max-w-[140px]">
                          {party}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="text-xs text-[var(--fg-secondary)]">{bill.category}</span>
                      </td>

                      {/* Dates */}
                      <td>
                        <div className="text-xs text-[var(--fg-primary)]">{formatDate(bill.billDate)}</div>
                        {bill.dueDate && (
                          <div className="text-[10px] text-[var(--fg-muted)]">Due: {formatDate(bill.dueDate)}</div>
                        )}
                      </td>

                      {/* Total */}
                      <td className="!text-right font-medium text-[var(--fg-primary)]">
                        {formatCurrency(total)}
                      </td>

                      {/* Outstanding */}
                      <td className="!text-right font-semibold">
                        <span className={outstanding > 0 ? (bill.type === 'payable' ? 'text-rose-400' : 'text-emerald-400') : 'text-[var(--fg-muted)]'}>
                          {formatCurrency(outstanding)}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            bill.paymentStatus === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : bill.paymentStatus === 'partially_paid'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : bill.paymentStatus === 'cancelled'
                              ? 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {bill.paymentStatus.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Attachment */}
                      <td>
                        {bill.attachment?.url ? (
                          <a
                            href={bill.attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-teal-400 hover:underline"
                            title={bill.attachment.name}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Doc</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-[var(--fg-muted)]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="!text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {bill.paymentStatus !== 'paid' && bill.paymentStatus !== 'cancelled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={() => openPayment(bill)}
                            >
                              <DollarSign className="w-3 h-3 mr-0.5" /> Pay
                            </Button>
                          )}

                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            onClick={() => setViewBill(bill)}
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            onClick={() => openEditBill(bill)}
                            title="Edit Bill"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            className="p-1 rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            onClick={() => {
                              if (confirm(`Are you sure you want to cancel/delete bill ${bill.billNumber}?`)) {
                                deleteMutation.mutate(bill._id!);
                              }
                            }}
                            title="Cancel / Delete"
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
      </TableShell>

      {/* Modals */}
      <BillModal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        initialType={initialType}
        editingBill={editingBill}
        autoOpenScanner={autoOpenScanner}
      />

      <RecordBillPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        bill={selectedBillForPayment}
      />

      {/* Bill Details Modal */}
      {viewBill && (
        <Modal
          open={!!viewBill}
          onClose={() => setViewBill(null)}
          title={`Bill Details — ${viewBill.billNumber}`}
          description={viewBill.title}
          variant="dialog"
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-[var(--fg-muted)]">
                Status: <span className="font-medium capitalize text-[var(--fg-primary)]">{viewBill.paymentStatus.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-2">
                {viewBill.attachment?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(viewBill.attachment?.url, '_blank')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Attachment
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setViewBill(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-[var(--fg-muted)]">Type:</span>
                <p className="font-semibold capitalize mt-0.5">{viewBill.type}</p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Party:</span>
                <p className="font-semibold mt-0.5">
                  {viewBill.type === 'receivable' ? viewBill.clientName || 'Client' : viewBill.vendorName || 'Vendor'}
                </p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Category:</span>
                <p className="font-semibold mt-0.5">{viewBill.category}</p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Payment Method:</span>
                <p className="font-semibold mt-0.5">{viewBill.paymentMethod || '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[var(--surface-sunken)]/60 border border-[var(--border-subtle)]">
              <div>
                <span className="text-[var(--fg-muted)]">Total Amount</span>
                <p className="text-sm font-bold text-[var(--fg-primary)] mt-0.5">
                  {formatCurrency(Number(viewBill.totalAmount) || 0)}
                </p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Amount Paid</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">
                  {formatCurrency(Number(viewBill.paidAmount) || 0)}
                </p>
              </div>
              <div>
                <span className="text-[var(--fg-muted)]">Outstanding</span>
                <p className="text-sm font-bold text-rose-400 mt-0.5">
                  {formatCurrency(Number(viewBill.outstandingAmount) || 0)}
                </p>
              </div>
            </div>

            {viewBill.description && (
              <div>
                <span className="text-[var(--fg-muted)] block mb-1">Description:</span>
                <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                  {viewBill.description}
                </div>
              </div>
            )}

            {viewBill.notes && (
              <div>
                <span className="text-[var(--fg-muted)] block mb-1">Notes:</span>
                <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--fg-secondary)]">
                  {viewBill.notes}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
