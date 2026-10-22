import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DollarSign,
  Upload,
  FileCheck,
  X,
  CreditCard,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import type { BillItem } from './BillModal';
import { syncFinanceQueries } from '../financeSync';

interface Props {
  open: boolean;
  onClose: () => void;
  bill: BillItem | null;
}

export function RecordBillPaymentModal({ open, onClose, bill }: Props) {
  const qc = useQueryClient();

  const outstanding = bill
    ? Math.max(0, (Number(bill.totalAmount) || 0) - (Number(bill.paidAmount) || 0))
    : 0;

  const [form, setForm] = useState({
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Bank Transfer',
    bankAccountId: '',
    reference: '',
    notes: '',
  });

  const [receiptAttachment, setReceiptAttachment] = useState<{
    name: string;
    url: string;
    mime?: string;
    size?: number;
  } | null>(null);

  const [uploading, setUploading] = useState(false);

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => (await api.get('/finance/bank-accounts')).data.data || [],
  });

  useEffect(() => {
    if (open && bill) {
      const remaining = Math.max(0, (Number(bill.totalAmount) || 0) - (Number(bill.paidAmount) || 0));
      setForm({
        amount: String(remaining),
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: bill.paymentMethod || 'Bank Transfer',
        bankAccountId: bankAccounts?.[0]?._id || '',
        reference: '',
        notes: `Payment for ${bill.billNumber} (${bill.title})`,
      });
      setReceiptAttachment(null);
    }
  }, [open, bill, bankAccounts]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size must be under 15MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data.data;
      setReceiptAttachment({
        name: uploaded.originalName || file.name,
        url: uploaded.url,
        mime: uploaded.mimeType || file.type,
        size: uploaded.size || file.size,
      });
      toast.success('Payment receipt uploaded');
    } catch (err: any) {
      toast.error(getErrorMessage(err) || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!bill?._id) throw new Error('No bill selected');
      const payload = {
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.bankAccountId || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        receiptAttachment: receiptAttachment || undefined,
      };

      return (await api.post(`/finance/bills/${bill._id}/payments`, payload)).data;
    },
    onSuccess: async () => {
      toast.success('Payment recorded successfully. Financial ledger updated.');
      await syncFinanceQueries(qc);
      onClose();
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to record payment');
    },
  });

  if (!bill) return null;

  const enteredAmount = Number(form.amount) || 0;
  const isOverpaying = enteredAmount > outstanding;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">Record Payment for {bill.billNumber}</div>
            <div className="text-xs text-[var(--fg-secondary)] font-normal">
              {bill.type === 'payable' ? 'Record vendor payout' : 'Record client receipt'}
            </div>
          </div>
        </div>
      }
      variant="dialog"
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[var(--fg-secondary)]">
            New Remaining: <span className="font-semibold text-[var(--fg-primary)]">
              ₹{Math.max(0, outstanding - enteredAmount).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={paymentMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="teal"
              disabled={
                !enteredAmount ||
                enteredAmount <= 0 ||
                isOverpaying ||
                paymentMutation.isPending
              }
              onClick={() => paymentMutation.mutate()}
            >
              {paymentMutation.isPending ? 'Recording…' : 'Confirm Payment'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-sm">
        {/* Bill Summary Banner */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--fg-primary)]">{bill.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              bill.type === 'payable' ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
            }`}>
              {bill.type === 'payable' ? 'Payable' : 'Receivable'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
            <div>
              <div className="text-[var(--fg-muted)]">Total Bill</div>
              <div className="font-semibold mt-0.5">{formatCurrency(Number(bill.totalAmount) || 0)}</div>
            </div>
            <div>
              <div className="text-[var(--fg-muted)]">Already Paid</div>
              <div className="font-semibold text-emerald-400 mt-0.5">{formatCurrency(Number(bill.paidAmount) || 0)}</div>
            </div>
            <div>
              <div className="text-[var(--fg-muted)]">Outstanding</div>
              <div className="font-semibold text-rose-400 mt-0.5">{formatCurrency(outstanding)}</div>
            </div>
          </div>
        </div>

        {/* Payment Amount */}
        <div>
          <div className="flex items-center justify-between">
            <Label>Payment Amount (INR) *</Label>
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() => setForm({ ...form, amount: String(outstanding) })}
            >
              Pay Full ({formatCurrency(outstanding)})
            </button>
          </div>
          <Input
            type="number"
            min="0.01"
            max={outstanding}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          {isOverpaying && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Amount cannot exceed outstanding balance of {formatCurrency(outstanding)}</span>
            </div>
          )}
        </div>

        {/* Date & Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Payment Date *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <Label>Payment Method *</Label>
            <Select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="UPI">UPI</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
              <option value="Other">Other</option>
            </Select>
          </div>
        </div>

        {/* Bank Account (for cash-basis ledger tracking) */}
        {bankAccounts && bankAccounts.length > 0 && (
          <div>
            <Label>Company Bank Account</Label>
            <Select
              value={form.bankAccountId}
              onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            >
              <option value="">Select Bank / Cash Account (Optional)</option>
              {bankAccounts.map((b: any) => (
                <option key={b._id} value={b._id}>
                  {b.bankName} - {b.accountNumber} ({formatCurrency(b.currentBalance ?? b.balance ?? 0)})
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Reference Number */}
        <div>
          <Label>Transaction Reference / UTR Number</Label>
          <Input
            placeholder="e.g. UTR1234567890 or Cheque #0045"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </div>

        {/* Notes */}
        <div>
          <Label>Notes / Remarks</Label>
          <Input
            placeholder="Additional details regarding this payment"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {/* Proof / Receipt Upload */}
        <div>
          <Label>Payment Receipt / Confirmation Proof (Optional)</Label>
          {receiptAttachment ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10">
              <div className="flex items-center gap-2 truncate">
                <FileCheck className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="font-medium text-xs truncate">{receiptAttachment.name}</span>
              </div>
              <button
                type="button"
                className="p-1 text-[var(--fg-muted)] hover:text-rose-400"
                onClick={() => setReceiptAttachment(null)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)] cursor-pointer text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors">
              <Upload className="w-4 h-4 text-[var(--accent)]" />
              <span>{uploading ? 'Uploading…' : 'Attach payment receipt (PDF / Image)'}</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={handleFileUpload}
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
