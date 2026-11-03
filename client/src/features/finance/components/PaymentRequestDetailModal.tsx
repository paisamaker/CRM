import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Upload,
  XCircle,
  FileImage,
  Trash2,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/auth';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { syncFinanceQueries } from '../financeSync';
import type { PaymentRequestItem } from './PaymentRequestsTab';

interface Props {
  open: boolean;
  onClose: () => void;
  item: PaymentRequestItem | null;
  onDeleted?: () => void;
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
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

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending Owner Approval';
    case 'approved':
      return 'Approved for Payment (Unpaid)';
    case 'rejected':
      return 'Rejected';
    case 'awaiting_final_approval':
      return 'Awaiting Final Owner Approval';
    case 'paid':
      return 'Paid';
    case 'disputed':
      return 'Disputed';
    default:
      return status;
  }
}

function personName(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'name' in value) {
    return String((value as { name?: string }).name || '—');
  }
  return '—';
}

export function PaymentRequestDetailModal({ open, onClose, item, onDeleted }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const isCeo = role === 'ceo';
  const isFinance = role === 'finance';
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [txnId, setTxnId] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const refresh = async () => {
    await syncFinanceQueries(qc);
    qc.invalidateQueries({ queryKey: ['payment-requests'] });
  };

  const approveAmount = useMutation({
    mutationFn: async () =>
      (await api.post(`/finance/payment-requests/${item!._id}/approve-amount`)).data,
    onSuccess: async () => {
      toast.success('Amount approved — payment may proceed');
      await refresh();
      onClose();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const rejectMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/finance/payment-requests/${item!._id}/reject`, { reason: rejectReason })).data,
    onSuccess: async () => {
      toast.success('Request rejected');
      setRejectReason('');
      await refresh();
      onClose();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('screenshot', screenshot!);
      if (txnId.trim()) fd.append('transactionId', txnId.trim());
      return (
        await api.post(`/finance/payment-requests/${item!._id}/upload-screenshot`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: async (res) => {
      const msg = res?.meta?.message || 'Screenshot uploaded';
      if (res?.meta?.requiresReapproval) toast.message(msg);
      else if (res?.meta?.awaitingManualReview) toast.message(msg);
      else toast.success(msg);
      setScreenshot(null);
      await refresh();
      onClose();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const approveProof = useMutation({
    mutationFn: async () =>
      (await api.post(`/finance/payment-requests/${item!._id}/approve-proof`)).data,
    onSuccess: async () => {
      toast.success('Payment confirmed — added to Finance');
      await refresh();
      onClose();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const disputeMut = useMutation({
    mutationFn: async () =>
      (await api.post(`/finance/payment-requests/${item!._id}/dispute`, { reason: disputeReason })).data,
    onSuccess: async () => {
      toast.success('Marked as Disputed');
      setDisputeReason('');
      await refresh();
      onClose();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const addTxnMut = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/finance/payment-requests/${item!._id}/transaction-id`, {
          transactionId: txnId.trim(),
        })
      ).data,
    onSuccess: async () => {
      toast.success('Transaction ID saved');
      await refresh();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const deleteMut = useMutation({
    mutationFn: async () => (await api.delete(`/finance/payment-requests/${item!._id}`)).data,
    onSuccess: async () => {
      toast.success('Payment request deleted');
      onClose();
      onDeleted?.();
      await refresh();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const canUpload = item?.status === 'approved';
  const showFinalApprove =
    isCeo &&
    (item?.status === 'awaiting_final_approval' ||
      (item?.status === 'approved' && !!item?.screenshot?.url));

  const creator =
    !item?.createdBy
      ? ''
      : typeof item.createdBy === 'string'
        ? item.createdBy
        : item.createdBy._id || '';
  const canDelete =
    !!item &&
    item.status !== 'paid' &&
    ((isCeo || isFinance) ||
      (!!userId &&
        creator === userId &&
        ['pending', 'rejected'].includes(item.status)));

  const history = useMemo(() => item?.history || [], [item]);

  if (!item) return null;

  const paymentInfo = [
    item.paymentDetails?.upiId ? `UPI: ${item.paymentDetails.upiId}` : null,
    item.paymentDetails?.bankAccountNumber
      ? `A/C: ${item.paymentDetails.bankAccountNumber}${
          item.paymentDetails.bankIfsc ? ` / ${item.paymentDetails.bankIfsc}` : ''
        }`
      : null,
    item.paymentDetails?.bankName || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="space-y-1">
          <div className="font-semibold">Payment Request #{item.requestNumber}</div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
            {item.noTransactionId || item.flags?.noTransactionId ? (
              <Badge tone="warning">No Transaction ID</Badge>
            ) : null}
            {item.flags?.needsManualReview ? <Badge tone="warning">Manual Review</Badge> : null}
          </div>
        </div>
      }
      variant="dialog"
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {canDelete ? (
            <Button
              variant="outline"
              className="border-rose-200 text-rose-700"
              disabled={deleteMut.isPending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Delete Payment Request #${item.requestNumber}?`,
                  description: 'This cannot be undone. Paid requests linked to Finance cannot be deleted.',
                  confirmLabel: 'Delete',
                  tone: 'danger',
                });
                if (ok) deleteMut.mutate();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-sm">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">Payee</div>
              <div className="font-semibold text-[var(--fg)]">{item.payeeName}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">Amount</div>
              <div className="font-semibold text-[var(--fg)]">
                {formatCurrency(Number(item.approvedAmount ?? item.amount))}
              </div>
              {item.approvedAmount != null &&
                Math.abs(Number(item.approvedAmount) - Number(item.amount)) >= 0.01 && (
                  <div className="text-xs text-[var(--fg-muted)]">
                    Current amount: {formatCurrency(Number(item.amount))}
                  </div>
                )}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">Category</div>
              <div className="font-medium">{item.category}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">Created by</div>
              <div className="font-medium">{personName(item.createdBy)}</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">Description</div>
            <div className="mt-0.5 text-[var(--fg-secondary)]">{item.description}</div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
              Payment information
            </div>
            {paymentInfo ? (
              <div className="mt-0.5 text-[var(--fg-secondary)]">{paymentInfo}</div>
            ) : !item.paymentDetails?.qrCode?.url ? (
              <div className="mt-0.5 text-[var(--fg-muted)]">—</div>
            ) : null}
            {item.paymentDetails?.qrCode?.url ? (
              <a
                href={item.paymentDetails.qrCode.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex overflow-hidden rounded-xl border border-[var(--border)] bg-white"
                title="Open QR full size"
              >
                <img
                  src={item.paymentDetails.qrCode.url}
                  alt="Payee QR"
                  className="h-56 w-56 object-contain p-2 sm:h-64 sm:w-64"
                />
              </a>
            ) : null}
          </div>
        </div>

        {item.screenshot?.url ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <FileImage className="h-4 w-4" /> Payment screenshot
            </div>
            <a
              href={item.screenshot.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]"
            >
              <img
                src={item.screenshot.url}
                alt="Payment proof"
                className="mx-auto max-h-[480px] w-full object-contain p-2"
              />
            </a>
            {item.ocr?.mismatches?.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <div className="font-semibold mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> OCR assist notes
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {item.ocr.mismatches.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {item.ocr?.transactionId || item.transactionId ? (
              <div className="text-xs text-[var(--fg-secondary)]">
                Txn/UTR: <span className="font-medium text-[var(--fg)]">{item.transactionId || item.ocr?.transactionId}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {isCeo && item.status === 'pending' ? (
          <div className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-[var(--teal-border)] bg-[var(--teal-soft)] p-3">
            <Button
              size="sm"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Approve amount?',
                  description: `Approve ₹${Number(item.amount).toLocaleString('en-IN')} for ${item.payeeName}? This only permits payment — status stays Unpaid until proof is approved.`,
                  confirmLabel: 'Approve',
                });
                if (ok) approveAmount.mutate();
              }}
              disabled={approveAmount.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve Amount
            </Button>
            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[200px]">
              <Input
                placeholder="Rejection reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="border-rose-200 text-rose-700"
                disabled={rejectReason.trim().length < 3 || rejectMut.isPending}
                onClick={() => rejectMut.mutate()}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </div>
        ) : null}

        {canUpload ? (
          <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <div className="font-semibold text-sm">Upload Payment Screenshot</div>
            <p className="text-xs text-[var(--fg-muted)]">
              Available only after owner amount approval. Owner final approval is still required before Paid.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Screenshot</Label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-1">
                <Label>Transaction / UTR ID (optional)</Label>
                <Input value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <Button
              size="sm"
              disabled={!screenshot || uploadMut.isPending}
              onClick={() => uploadMut.mutate()}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploadMut.isPending ? 'Uploading…' : 'Upload Screenshot'}
            </Button>
          </div>
        ) : null}

        {showFinalApprove ? (
          <div className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-emerald-200 bg-emerald-50 p-3">
            <Button
              size="sm"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Confirm payment proof?',
                  description:
                    'This marks the request Paid and adds it to Finance under the selected category. OCR is assistive only — you are the final approval.',
                  confirmLabel: 'Mark Paid',
                });
                if (ok) approveProof.mutate();
              }}
              disabled={approveProof.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve Screenshot & Mark Paid
            </Button>
            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[200px]">
              <Input
                placeholder="Return for correction — reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={rejectReason.trim().length < 3 || rejectMut.isPending}
                onClick={() => rejectMut.mutate()}
              >
                Return for correction
              </Button>
            </div>
          </div>
        ) : null}

        {isCeo && item.status === 'paid' ? (
          <div className="flex flex-wrap gap-2 rounded-[var(--radius)] border border-rose-200 bg-rose-50 p-3">
            <Input
              placeholder="Dispute reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-700"
              disabled={disputeReason.trim().length < 3 || disputeMut.isPending}
              onClick={() => disputeMut.mutate()}
            >
              Mark Disputed
            </Button>
          </div>
        ) : null}

        {(item.noTransactionId || item.flags?.noTransactionId) &&
        ['approved', 'awaiting_final_approval', 'paid', 'disputed'].includes(item.status) ? (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 space-y-1 min-w-[180px]">
              <Label>Add Transaction / UTR ID</Label>
              <Input value={txnId} onChange={(e) => setTxnId(e.target.value)} />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={txnId.trim().length < 6 || addTxnMut.isPending}
              onClick={() => addTxnMut.mutate()}
            >
              Save ID
            </Button>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
            <Clock className="h-3.5 w-3.5" /> History
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="text-xs text-[var(--fg-muted)]">No history yet</div>
            ) : (
              [...history].reverse().map((h, idx) => (
                <div
                  key={`${h.action}-${idx}`}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-xs"
                >
                  <div className="font-medium text-[var(--fg)]">
                    {h.action.replace(/_/g, ' ')} · {personName(h.by)}
                  </div>
                  <div className="text-[var(--fg-muted)]">{formatDateTime(h.at)}</div>
                  {h.note ? <div className="mt-0.5 text-[var(--fg-secondary)]">{h.note}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
