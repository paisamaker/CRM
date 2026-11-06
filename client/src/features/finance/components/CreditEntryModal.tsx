import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRight } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import type { CreditEntryType, CreditFacilityItem } from './creditTypes';
import { ENTRY_TYPE_LABELS } from './creditTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  facility: CreditFacilityItem | null;
  defaultType?: CreditEntryType;
}

export function CreditEntryModal({ open, onClose, facility, defaultType = 'repayment' }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: defaultType as CreditEntryType,
    amount: '',
    adjustmentDirection: 'increase' as 'increase' | 'decrease',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Bank Transfer',
    note: '',
    reference: '',
  });

  useEffect(() => {
    if (!open || !facility) return;
    setForm({
      type: defaultType,
      amount: defaultType === 'repayment' ? String(facility.outstandingBalance || '') : '',
      adjustmentDirection: 'increase',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: facility.paymentMethod || 'Bank Transfer',
      note: '',
      reference: '',
    });
  }, [open, facility, defaultType]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/finance/credit/facilities/${facility!._id}/entries`, {
          type: form.type,
          amount: Number(form.amount),
          adjustmentDirection: form.type === 'adjustment' ? form.adjustmentDirection : undefined,
          date: form.date,
          paymentMethod: form.paymentMethod || null,
          note: form.note || null,
          reference: form.reference || null,
        })
      ).data,
    onSuccess: () => {
      toast.success('Credit entry recorded (excluded from main finance)');
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-facility', facility?._id] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (!facility) return null;

  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title="Add credit transaction"
      description={`${facility.title} · Outstanding ${formatCurrency(facility.outstandingBalance)}`}
      size="sm"
      preventDismiss={save.isPending}
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || !(Number(form.amount) > 0)}
            onClick={() => save.mutate()}
            className="gap-1.5"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {save.isPending ? 'Saving…' : 'Post entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <Label>Entry type</Label>
          <Select
            className="mt-1"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CreditEntryType }))}
          >
            {(Object.keys(ENTRY_TYPE_LABELS) as CreditEntryType[]).map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
            {form.type === 'repayment'
              ? 'Reduces outstanding balance'
              : form.type === 'disbursement' || form.type === 'interest' || form.type === 'fee'
                ? 'Increases outstanding balance'
                : 'Manual balance correction'}
          </p>
        </div>

        {form.type === 'adjustment' && (
          <div>
            <Label>Adjustment direction</Label>
            <Select
              className="mt-1"
              value={form.adjustmentDirection}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  adjustmentDirection: e.target.value as 'increase' | 'decrease',
                }))
              }
            >
              <option value="increase">Increase outstanding</option>
              <option value="decrease">Decrease outstanding</option>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount</Label>
            <Input
              className="mt-1"
              type="number"
              min={0.01}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              className="mt-1"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Payment method</Label>
          <Select
            className="mt-1"
            value={form.paymentMethod}
            onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
          >
            {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Credit Card', 'Other'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Reference</Label>
          <Input
            className="mt-1"
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="UTR / cheque no."
          />
        </div>

        <div>
          <Label>Note</Label>
          <Textarea
            className="mt-1 min-h-16"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
      </div>
    </Modal>
  );
}
