import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, CreditCard, ImagePlus, QrCode, Upload, X } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { syncFinanceQueries } from '../financeSync';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PaymentRequestModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    payeeName: '',
    amount: '',
    description: '',
    category: '',
    upiId: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankName: '',
    accountHolderName: '',
    paymentNotes: '',
  });
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const { data: catData } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
    enabled: open,
  });

  const categories: string[] = catData?.paymentRequest?.length
    ? catData.paymentRequest
    : ['Office Expense', 'Vendor Payment', 'Salary', 'USDT Payment', 'Other'];

  useEffect(() => {
    if (!open) return;
    setForm({
      payeeName: '',
      amount: '',
      description: '',
      category: categories[0] || 'Other',
      upiId: '',
      bankAccountNumber: '',
      bankIfsc: '',
      bankName: '',
      accountHolderName: '',
      paymentNotes: '',
    });
    setQrFile(null);
    setQrPreview(null);
  }, [open]);

  useEffect(() => {
    if (!qrFile) {
      setQrPreview(null);
      return;
    }
    const url = URL.createObjectURL(qrFile);
    setQrPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qrFile]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('payeeName', form.payeeName.trim());
      fd.append('amount', String(Number(form.amount)));
      fd.append('description', form.description.trim());
      fd.append('category', form.category);
      if (form.upiId.trim()) fd.append('upiId', form.upiId.trim());
      if (form.bankAccountNumber.trim()) fd.append('bankAccountNumber', form.bankAccountNumber.trim());
      if (form.bankIfsc.trim()) fd.append('bankIfsc', form.bankIfsc.trim());
      if (form.bankName.trim()) fd.append('bankName', form.bankName.trim());
      if (form.accountHolderName.trim()) fd.append('accountHolderName', form.accountHolderName.trim());
      if (form.paymentNotes.trim()) fd.append('paymentNotes', form.paymentNotes.trim());
      if (qrFile) fd.append('qrCode', qrFile);
      return (
        await api.post('/finance/payment-requests', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: async () => {
      toast.success('Payment request submitted for owner approval');
      await syncFinanceQueries(qc);
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) || 'Failed to create payment request');
    },
  });

  const hasBank =
    !!form.bankAccountNumber.trim() ||
    !!form.bankIfsc.trim() ||
    !!form.bankName.trim() ||
    !!form.accountHolderName.trim();
  const hasPaymentDetail = !!form.upiId.trim() || !!form.bankAccountNumber.trim() || !!qrFile;

  const canSubmit =
    form.payeeName.trim().length >= 2 &&
    Number(form.amount) > 0 &&
    form.description.trim().length >= 2 &&
    !!form.category &&
    hasPaymentDetail;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-[var(--brand-soft)] p-2.5 text-[var(--brand)]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-[var(--fg)]">New Payment Request</div>
            <div className="text-xs font-normal text-[var(--fg-secondary)]">
              Owner approval required before payment
            </div>
          </div>
        </div>
      }
      variant="dialog"
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-[var(--fg-muted)]">
            {hasPaymentDetail
              ? 'Ready to submit for owner approval'
              : 'Add UPI, bank account, or QR code to continue'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 py-1">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Payee name</Label>
            <Input
              value={form.payeeName}
              onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
              placeholder="Rahul Sharma"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="15,000"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What the payment is for"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="border-b border-[var(--border)] bg-[linear-gradient(120deg,var(--brand-soft)_0%,transparent_55%)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--fg)]">How should this be paid?</div>
            <p className="mt-0.5 text-[11px] text-[var(--fg-secondary)]">
              Provide any one: QR code, bank account, or UPI. UPI is optional.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  qrFile
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-[var(--bg)] text-[var(--fg-muted)] border border-[var(--border)]'
                )}
              >
                QR {qrFile ? 'added' : 'optional'}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  form.bankAccountNumber.trim()
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-[var(--bg)] text-[var(--fg-muted)] border border-[var(--border)]'
                )}
              >
                Bank {form.bankAccountNumber.trim() ? 'added' : 'optional'}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  form.upiId.trim()
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-[var(--bg)] text-[var(--fg-muted)] border border-[var(--border)]'
                )}
              >
                UPI optional
              </span>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {/* QR first — visual & common for India payments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg)]">
                <QrCode className="h-3.5 w-3.5 text-[var(--brand)]" />
                QR code
                <span className="font-normal text-[var(--fg-muted)]">· optional</span>
              </div>

              {qrPreview ? (
                <div className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="relative">
                    <img
                      src={qrPreview}
                      alt="QR preview"
                      className="h-36 w-36 rounded-lg border border-[var(--border)] object-cover bg-white"
                    />
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-sm hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => setQrFile(null)}
                      title="Remove QR"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 pt-1">
                    <div className="text-xs font-semibold text-[var(--fg)]">QR attached</div>
                    <div className="truncate text-[11px] text-[var(--fg-muted)]">
                      {qrFile?.name}
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 pt-1 text-[11px] font-semibold text-[var(--brand)] hover:underline">
                      <Upload className="h-3 w-3" />
                      Replace image
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition',
                    'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/50 hover:bg-[var(--brand-soft)]/40'
                  )}
                >
                  <div className="rounded-full bg-[var(--brand-soft)] p-2.5 text-[var(--brand)]">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Upload payee QR code</div>
                    <div className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
                      JPG, PNG or WebP · skip if using bank / UPI only
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>

            {/* Bank */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg)]">
                <Building2 className="h-3.5 w-3.5 text-[var(--brand)]" />
                Bank account
                <span className="font-normal text-[var(--fg-muted)]">· optional</span>
                {hasBank && !form.bankAccountNumber.trim() ? (
                  <span className="font-normal text-amber-700">· add account number</span>
                ) : null}
              </div>
              <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Account number</Label>
                  <Input
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                    placeholder="e.g. 123456789012"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>IFSC</Label>
                  <Input
                    value={form.bankIfsc}
                    onChange={(e) =>
                      setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })
                    }
                    placeholder="HDFC0001234"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank name</Label>
                  <Input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="HDFC Bank"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Account holder</Label>
                  <Input
                    value={form.accountHolderName}
                    onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                    placeholder="Name on the account"
                  />
                </div>
              </div>
            </div>

            {/* UPI — clearly optional */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg)]">
                <CreditCard className="h-3.5 w-3.5 text-[var(--brand)]" />
                UPI ID
                <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fg-muted)]">
                  Optional
                </span>
              </div>
              <Input
                value={form.upiId}
                onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                placeholder="name@upi — leave blank if not needed"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment notes <span className="font-normal text-[var(--fg-muted)]">(optional)</span></Label>
              <Input
                value={form.paymentNotes}
                onChange={(e) => setForm({ ...form, paymentNotes: e.target.value })}
                placeholder="Any extra instructions for the payer"
              />
            </div>

            {!hasPaymentDetail ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                Add at least one payment method: QR image, bank account number, or UPI ID.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  );
}
