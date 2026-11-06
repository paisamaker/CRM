import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Lock, Pencil } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/stores/auth';
import type { CreditEntryItem, CreditFacilityItem } from './creditTypes';
import { ENTRY_TYPE_LABELS } from './creditTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  facilityId: string | null;
  onEdit: (facility: CreditFacilityItem) => void;
  onAddEntry: (facility: CreditFacilityItem, type?: 'repayment' | 'interest' | 'fee' | 'disbursement') => void;
}

export function CreditFacilityDetailModal({
  open,
  onClose,
  facilityId,
  onEdit,
  onAddEntry,
}: Props) {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'ceo' || role === 'manager';

  const { data, isLoading } = useQuery({
    queryKey: ['credit-facility', facilityId],
    queryFn: async () =>
      (await api.get(`/finance/credit/facilities/${facilityId}`)).data.data as {
        facility: CreditFacilityItem;
        entries: CreditEntryItem[];
      },
    enabled: open && !!facilityId,
  });

  const facility = data?.facility;
  const entries = data?.entries || [];

  const closeFacility = useMutation({
    mutationFn: async (force: boolean) =>
      (await api.post(`/finance/credit/facilities/${facilityId}/close`, { force })).data,
    onSuccess: () => {
      toast.success('Facility closed');
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-facility', facilityId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) =>
      (await api.delete(`/finance/credit/facilities/${facilityId}/entries/${entryId}`)).data,
    onSuccess: () => {
      toast.success('Entry removed');
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-facility', facilityId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteFacility = useMutation({
    mutationFn: async () =>
      (await api.delete(`/finance/credit/facilities/${facilityId}`, { params: { force: true } })).data,
    onSuccess: () => {
      toast.success('Facility deleted');
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={facility ? facility.title : 'Credit facility'}
      description={
        facility
          ? `CR-${facility.facilityNumber} · ${facility.kind === 'loan' ? 'Loan' : 'Credit'} · ${
              facility.direction === 'borrowed' ? 'Borrowed from' : 'Lent to'
            } ${facility.partyName}`
          : 'Loading…'
      }
      size="lg"
      footer={
        facility ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {canManage && facility.status !== 'closed' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs"
                  disabled={closeFacility.isPending}
                  onClick={async () => {
                    const force = (facility.outstandingBalance || 0) > 0;
                    const ok = await confirmDialog({
                      title: force ? 'Force-close facility?' : 'Close facility?',
                      description: force
                        ? 'Outstanding balance is not zero. Close anyway?'
                        : 'Mark this credit facility as closed.',
                      confirmLabel: 'Close',
                      tone: 'danger',
                    });
                    if (ok) closeFacility.mutate(force);
                  }}
                >
                  <Lock className="h-3.5 w-3.5" /> Close
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-rose-200 text-xs text-rose-700"
                  disabled={deleteFacility.isPending}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Delete credit facility?',
                      description: 'Deletes the facility and all its credit entries. This does not affect main finance.',
                      detail: <span className="font-semibold">{facility.title}</span>,
                      confirmLabel: 'Delete',
                      tone: 'danger',
                    });
                    if (ok) deleteFacility.mutate();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => onEdit(facility)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {facility.status !== 'closed' ? (
                <Button size="sm" className="gap-1 text-xs" onClick={() => onAddEntry(facility, 'repayment')}>
                  <Plus className="h-3.5 w-3.5" /> Add entry
                </Button>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      {isLoading || !facility ? (
        <div className="py-10 text-center text-sm text-[var(--fg-muted)]">Loading facility…</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Outstanding
              </div>
              <div className="mt-1 text-lg font-bold text-[var(--fg)]">
                {formatCurrency(facility.outstandingBalance)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Principal
              </div>
              <div className="mt-1 text-lg font-bold text-[var(--fg)]">
                {formatCurrency(facility.principalAmount)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Interest
              </div>
              <div className="mt-1 text-lg font-bold text-[var(--fg)]">
                {facility.hasInterest && facility.interestRate != null
                  ? `${facility.interestRate}%`
                  : 'None'}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Status
              </div>
              <div className="mt-1.5">
                <Badge tone={statusTone(facility.status)}>{facility.status}</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
            Separate credit ledger — these amounts are <strong>not</strong> included in main financial
            income, expenses, or P&amp;L reports.
          </div>

          <div className="grid gap-2 text-xs text-[var(--fg-secondary)] sm:grid-cols-2">
            <div>
              <span className="text-[var(--fg-muted)]">Kind:</span>{' '}
              {facility.kind === 'loan' ? 'Loan' : 'Credit'} ·{' '}
              {facility.direction === 'lent' ? 'Lent' : 'Borrowed'}
            </div>
            <div>
              <span className="text-[var(--fg-muted)]">Start:</span> {formatDate(facility.startDate)}
            </div>
            <div>
              <span className="text-[var(--fg-muted)]">Due:</span>{' '}
              {facility.dueDate ? formatDate(facility.dueDate) : '—'}
            </div>
            <div>
              <span className="text-[var(--fg-muted)]">Method:</span> {facility.paymentMethod || '—'}
            </div>
            <div>
              <span className="text-[var(--fg-muted)]">Reference:</span> {facility.reference || '—'}
            </div>
            {facility.kind === 'loan' ? (
              <>
                <div>
                  <span className="text-[var(--fg-muted)]">Lender type:</span>{' '}
                  {facility.lenderType || '—'}
                </div>
                <div>
                  <span className="text-[var(--fg-muted)]">Tenure:</span>{' '}
                  {facility.tenureMonths != null ? `${facility.tenureMonths} months` : '—'}
                </div>
                <div>
                  <span className="text-[var(--fg-muted)]">EMI:</span>{' '}
                  {facility.emiAmount != null ? formatCurrency(facility.emiAmount) : '—'}
                </div>
                <div>
                  <span className="text-[var(--fg-muted)]">Processing fee:</span>{' '}
                  {facility.processingFee != null ? formatCurrency(facility.processingFee) : '—'}
                </div>
                <div>
                  <span className="text-[var(--fg-muted)]">Purpose:</span>{' '}
                  {facility.loanPurpose || '—'}
                </div>
                <div>
                  <span className="text-[var(--fg-muted)]">Collateral:</span>{' '}
                  {facility.collateral || '—'}
                </div>
              </>
            ) : null}
            {facility.notes ? (
              <div className="sm:col-span-2">
                <span className="text-[var(--fg-muted)]">Notes:</span> {facility.notes}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--fg)]">Credit transactions</h3>
              <span className="text-[11px] text-[var(--fg-muted)]">{entries.length} entries</span>
            </div>
            {entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--fg-muted)]">
                No entries yet
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg-subtle)] text-[10px] uppercase tracking-wide text-[var(--fg-muted)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold text-right">Amount</th>
                      <th className="px-3 py-2 font-semibold text-right">Balance</th>
                      <th className="px-3 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {entries.map((e, idx) => (
                      <tr key={e._id} className="bg-[var(--bg-elevated)]">
                        <td className="px-3 py-2 font-mono text-[var(--fg-muted)]">{e.entryNumber}</td>
                        <td className="px-3 py-2">{formatDate(e.date)}</td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              e.type === 'repayment'
                                ? 'teal'
                                : e.type === 'interest' || e.type === 'fee'
                                  ? 'orange'
                                  : 'info'
                            }
                          >
                            {ENTRY_TYPE_LABELS[e.type]}
                            {e.type === 'adjustment' && e.adjustmentDirection
                              ? ` (${e.adjustmentDirection})`
                              : ''}
                          </Badge>
                          {e.note ? (
                            <div className="mt-0.5 text-[10px] text-[var(--fg-muted)]">{e.note}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--fg-secondary)]">
                          {formatCurrency(e.balanceAfter)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canManage && idx === 0 ? (
                            <button
                              type="button"
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                              title="Delete latest entry"
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: 'Delete latest entry?',
                                  description: 'Only the most recent entry can be removed.',
                                  confirmLabel: 'Delete',
                                  tone: 'danger',
                                });
                                if (ok) deleteEntry.mutate(e._id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
