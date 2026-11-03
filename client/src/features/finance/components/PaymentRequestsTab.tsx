import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  Search,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, TableShell } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/stores/auth';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { PaymentRequestModal } from './PaymentRequestModal';
import { PaymentRequestDetailModal } from './PaymentRequestDetailModal';
import { syncFinanceQueries } from '../financeSync';

export interface PaymentRequestItem {
  _id: string;
  requestNumber: number;
  payeeName: string;
  paymentDetails?: {
    upiId?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankName?: string;
    accountHolderName?: string;
    qrCode?: { name?: string; url?: string };
    notes?: string;
  };
  amount: number;
  approvedAmount?: number;
  currency?: string;
  description: string;
  category: string;
  status: string;
  noTransactionId?: boolean;
  flags?: {
    noTransactionId?: boolean;
    amountMismatch?: boolean;
    ocrUnclear?: boolean;
    needsManualReview?: boolean;
  };
  screenshot?: { name?: string; url?: string };
  ocr?: {
    mismatches?: string[];
    transactionId?: string;
    amount?: number;
    payeeName?: string;
    confidence?: string;
  };
  transactionId?: string;
  createdBy?: string | { _id?: string; name?: string; email?: string };
  history?: { action: string; by: unknown; at: string; note?: string }[];
  createdAt?: string;
}

function creatorId(item: PaymentRequestItem) {
  if (!item.createdBy) return '';
  return typeof item.createdBy === 'string' ? item.createdBy : item.createdBy._id || '';
}

function statusTone(status: string) {
  switch (status) {
    case 'paid':
      return 'success';
    case 'approved':
      return 'info';
    case 'pending':
    case 'awaiting_final_approval':
      return 'warning';
    case 'rejected':
    case 'disputed':
      return 'danger';
    default:
      return 'default';
  }
}

function shortStatus(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved · Unpaid';
    case 'rejected':
      return 'Rejected';
    case 'awaiting_final_approval':
      return 'Awaiting Final';
    case 'paid':
      return 'Paid';
    case 'disputed':
      return 'Disputed';
    default:
      return status;
  }
}

export function PaymentRequestsTab() {
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const isCeo = role === 'ceo';
  const isFinance = role === 'finance';
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentRequestItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PaymentRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const canReject = (item: PaymentRequestItem) =>
    isCeo && ['pending', 'awaiting_final_approval'].includes(item.status);

  const canDelete = (item: PaymentRequestItem) => {
    if (item.status === 'paid') return false;
    if (isCeo || isFinance) {
      return ['pending', 'approved', 'awaiting_final_approval', 'rejected', 'disputed'].includes(
        item.status
      );
    }
    return (
      !!userId &&
      creatorId(item) === userId &&
      ['pending', 'rejected'].includes(item.status)
    );
  };

  const { data, isLoading } = useQuery({
    queryKey: ['payment-requests', statusFilter, flagFilter, search, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (flagFilter === 'no_transaction_id') params.flag = 'no_transaction_id';
      if (flagFilter === 'disputed') params.flag = 'disputed';
      if (search.trim()) params.search = search.trim();
      return (await api.get('/finance/payment-requests', { params })).data.data;
    },
  });

  const items: PaymentRequestItem[] = data?.items || [];
  const pagination = data?.pagination;
  const statusCounts: Record<string, number> = data?.statusCounts || {};

  const pendingCount = statusCounts.pending || 0;
  const awaitingFinal = statusCounts.awaiting_final_approval || 0;
  const noTxnCount = useMemo(
    () => items.filter((i) => i.noTransactionId || i.flags?.noTransactionId).length,
    [items]
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFinanceQueries(qc);
      await qc.invalidateQueries({ queryKey: ['payment-requests'] });
      toast.success('Payment requests synchronized');
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const refreshList = async () => {
    await syncFinanceQueries(qc);
    await qc.invalidateQueries({ queryKey: ['payment-requests'] });
  };

  const rejectMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/finance/payment-requests/${rejectTarget!._id}/reject`, {
          reason: rejectReason.trim(),
        })
      ).data,
    onSuccess: async () => {
      const id = rejectTarget?._id;
      toast.success('Payment request rejected');
      setRejectTarget(null);
      setRejectReason('');
      if (id && selected?._id === id) setSelected(null);
      await refreshList();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err) || 'Reject failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/payment-requests/${id}`)).data,
    onSuccess: async (_data, id) => {
      toast.success('Payment request deleted');
      if (selected?._id === id) setSelected(null);
      await refreshList();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err) || 'Delete failed'),
  });

  const handleDelete = async (item: PaymentRequestItem) => {
    const ok = await confirmDialog({
      title: `Delete Payment Request #${item.requestNumber}?`,
      description: `Remove request for ${item.payeeName} (${formatCurrency(Number(item.amount))}). This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate(item._id);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[11px] font-medium text-[var(--fg-muted)]">Approval Pending</div>
          <div className="mt-1 text-2xl font-bold text-[var(--fg)]">{pendingCount}</div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[11px] font-medium text-[var(--fg-muted)]">Awaiting Final Approval</div>
          <div className="mt-1 text-2xl font-bold text-[var(--fg)]">{awaitingFinal}</div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[11px] font-medium text-[var(--fg-muted)]">Paid</div>
          <div className="mt-1 text-2xl font-bold text-[var(--fg)]">{statusCounts.paid || 0}</div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="text-[11px] font-medium text-[var(--fg-muted)]">No Txn ID (this page)</div>
          <div className="mt-1 text-2xl font-bold text-[var(--fg)]">{noTxnCount}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
            <Input
              className="pl-8"
              placeholder="Search payee, description, #…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-[180px]"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved (Unpaid)</option>
            <option value="awaiting_final_approval">Awaiting Final</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="disputed">Disputed</option>
          </Select>
          <Select
            value={flagFilter}
            onChange={(e) => {
              setFlagFilter(e.target.value);
              setPage(1);
            }}
            className="w-[170px]"
          >
            <option value="all">All flags</option>
            <option value="no_transaction_id">No Transaction ID</option>
            <option value="disputed">Disputed only</option>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--brand-soft)]"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
          </button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Request
          </Button>
        </div>
      </div>

      {isCeo && pendingCount > 0 ? (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {pendingCount} payment request{pendingCount === 1 ? '' : 's'} waiting for your amount approval.
        </div>
      ) : null}

      <TableShell>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--fg-muted)]">Loading payment requests…</div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No payment requests"
            description="Create a request with payee details — the owner must approve before payment and proof upload."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Request
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {items.map((item) => {
              const paymentBits = [
                item.paymentDetails?.upiId ? `UPI: ${item.paymentDetails.upiId}` : null,
                item.paymentDetails?.bankAccountNumber
                  ? `A/C …${String(item.paymentDetails.bankAccountNumber).slice(-4)}`
                  : null,
                item.paymentDetails?.qrCode?.url ? 'QR attached' : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <div
                  key={item._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(item);
                    }
                  }}
                  className="flex cursor-pointer flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[var(--bg)]/60 focus:outline-none focus-visible:bg-[var(--brand-soft)]/40"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--fg-muted)]">
                        #{item.requestNumber}
                      </span>
                      <span className="font-semibold text-[var(--fg)]">{item.payeeName}</span>
                      <Badge tone={statusTone(item.status)}>{shortStatus(item.status)}</Badge>
                      {item.noTransactionId || item.flags?.noTransactionId ? (
                        <Badge tone="warning">No Txn ID</Badge>
                      ) : null}
                      {item.flags?.needsManualReview ? (
                        <Badge tone="orange">
                          <AlertTriangle className="h-3 w-3" /> Review
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--fg-secondary)] line-clamp-1">
                      {item.description}
                    </div>
                    <div className="text-[11px] text-[var(--fg-muted)]">
                      {item.category}
                      {paymentBits ? ` · ${paymentBits}` : ''}
                      {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-semibold text-[var(--fg)]">
                        {formatCurrency(Number(item.approvedAmount ?? item.amount))}
                      </div>
                      {item.status === 'approved' ? (
                        <div className="text-[10px] text-[var(--fg-muted)] flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Upload screenshot available
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(item);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> Open
                      </Button>
                      {canReject(item) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectReason('');
                            setRejectTarget(item);
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      ) : null}
                      {canDelete(item) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          disabled={deleteMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(item);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TableShell>

      {pagination && pagination.pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-[var(--fg-muted)]">
            Page {page} / {pagination.pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <PaymentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PaymentRequestDetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        item={selected}
        onDeleted={() => {
          setSelected(null);
          void refreshList();
        }}
      />

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
        title={`Reject Payment Request #${rejectTarget?.requestNumber || ''}`}
        description={
          rejectTarget
            ? `${rejectTarget.payeeName} · ${formatCurrency(Number(rejectTarget.amount))}`
            : undefined
        }
        variant="dialog"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={rejectReason.trim().length < 3 || rejectMutation.isPending}
              onClick={() => rejectMutation.mutate()}
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5 py-1">
          <Label>Rejection reason</Label>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this request being rejected?"
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}
