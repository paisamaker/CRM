import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  X,
  Building2,
  Users,
  Briefcase,
  DollarSign,
  Calendar,
  CreditCard,
  Tag,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/auth';

export interface TransactionItem {
  _id?: string;
  type: 'revenue' | 'expense';
  category: string;
  amount: number | string;
  taxAmount?: number | string;
  title?: string;
  description?: string;
  currency?: string;
  date: string;
  paymentMethod?: string;
  client?: any;
  vendor?: any;
  employee?: any;
  bankAccount?: any;
  notes?: string;
  attachment?: { name: string; url: string; mime?: string; size?: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialType?: 'revenue' | 'expense';
  editingTransaction?: TransactionItem | null;
}

export function TransactionModal({
  open,
  onClose,
  initialType = 'expense',
  editingTransaction,
}: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const qc = useQueryClient();

  const isEditing = !!editingTransaction?._id;

  const [form, setForm] = useState({
    type: initialType,
    category: '',
    amount: '',
    taxAmount: '0',
    title: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Bank Transfer',
    client: '',
    vendor: '',
    employee: '',
    bankAccountId: '',
    notes: '',
  });

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<any>(null);

  // Fetch dynamic categories
  const { data: catData } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
    enabled: open,
  });

  // Fetch related parties for dropdowns
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-lookup'],
    queryFn: async () => (await api.get('/clients', { params: { limit: 100 } })).data.data.items || [],
    enabled: open,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-lookup'],
    queryFn: async () => (await api.get('/finance/vendors', { params: { limit: 100 } })).data.data.items || [],
    enabled: open,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-lookup'],
    queryFn: async () => (await api.get('/users', { params: { limit: 100 } })).data.data.items || [],
    enabled: open,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts-lookup'],
    queryFn: async () => (await api.get('/finance/bank-accounts')).data.data.items || [],
    enabled: open,
  });

  // Populate on edit
  useEffect(() => {
    if (editingTransaction) {
      setForm({
        type: editingTransaction.type,
        category: editingTransaction.category,
        amount: String(editingTransaction.amount),
        taxAmount: String(editingTransaction.taxAmount || 0),
        title: editingTransaction.title || '',
        description: editingTransaction.description || '',
        date: editingTransaction.date ? editingTransaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        paymentMethod: editingTransaction.paymentMethod || 'Bank Transfer',
        client: typeof editingTransaction.client === 'object' ? editingTransaction.client?._id || '' : editingTransaction.client || '',
        vendor: typeof editingTransaction.vendor === 'object' ? editingTransaction.vendor?._id || '' : editingTransaction.vendor || '',
        employee: typeof editingTransaction.employee === 'object' ? editingTransaction.employee?._id || '' : editingTransaction.employee || '',
        bankAccountId: typeof editingTransaction.bankAccount === 'object' ? editingTransaction.bankAccount?._id || '' : editingTransaction.bankAccount || '',
        notes: editingTransaction.notes || '',
      });
      setExistingAttachment(editingTransaction.attachment || null);
    } else {
      const defaultCat = initialType === 'revenue' ? 'Client Payment' : 'Office Expenses';
      setForm({
        type: initialType,
        category: defaultCat,
        amount: '',
        taxAmount: '0',
        title: '',
        description: '',
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Bank Transfer',
        client: '',
        vendor: '',
        employee: '',
        bankAccountId: '',
        notes: '',
      });
      setExistingAttachment(null);
    }
    setAttachmentFile(null);
  }, [editingTransaction, initialType, open]);

  const categories =
    form.type === 'expense'
      ? catData?.expense || ['Software Purchase', 'Office Expenses', 'Marketing', 'Other Expenses']
      : catData?.income || ['Client Payment', 'Project Revenue', 'Sales Revenue', 'Other Income'];

  // Mutation to save transaction
  const mutation = useMutation({
    mutationFn: async () => {
      let attachmentPayload = existingAttachment;

      // Upload new attachment if selected
      if (attachmentFile) {
        const formData = new FormData();
        formData.append('file', attachmentFile);
        formData.append('folder', 'transactions');
        const uploadRes = await api.post('/files', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const doc = uploadRes.data.data;
        attachmentPayload = {
          name: doc.name || attachmentFile.name,
          url: doc.url,
          mime: doc.mime || attachmentFile.type,
          size: doc.size || attachmentFile.size,
        };
      }

      const payload = {
        type: form.type,
        category: form.category || categories[0],
        amount: Number(form.amount),
        taxAmount: Number(form.taxAmount || 0),
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        date: form.date,
        paymentMethod: form.paymentMethod,
        client: form.client || undefined,
        vendor: form.vendor || undefined,
        employee: form.employee || undefined,
        bankAccountId: form.bankAccountId || undefined,
        notes: form.notes || undefined,
        attachment: attachmentPayload,
        submitForApproval: role === 'ceo' ? false : form.type === 'expense',
      };

      if (isEditing) {
        return (await api.patch(`/finance/transactions/${editingTransaction!._id}`, payload)).data;
      }
      return (await api.post('/finance/transactions', payload)).data;
    },
    onSuccess: () => {
      toast.success(
        isEditing
          ? 'Transaction updated successfully'
          : role === 'ceo'
          ? 'Transaction recorded successfully'
          : form.type === 'expense'
          ? 'Expense submitted for CEO approval'
          : 'Transaction recorded successfully'
      );
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['finance-dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-reports'] });
      qc.invalidateQueries({ queryKey: ['finance-overview'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Transaction' : `Record ${form.type === 'revenue' ? 'Income' : 'Expense'}`}
      description="Enter transaction details to automatically sync with the ledger and dashboard"
      variant="dialog"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={form.type === 'revenue' ? 'teal' : 'primary'}
            disabled={!form.amount || Number(form.amount) <= 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Record Transaction'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Type Toggle */}
        {!isEditing && role !== 'employee' && (
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: 'expense', category: 'Office Expenses' }))}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                form.type === 'expense'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Expense (-)
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: 'revenue', category: 'Client Payment' }))}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                form.type === 'revenue'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Income (+)
            </button>
          </div>
        )}

        {/* Title */}
        <div>
          <Label required>Title / Purpose</Label>
          <Input
            placeholder={form.type === 'revenue' ? 'e.g. Creator Campaign Payment - Brand X' : 'e.g. Annual Adobe CC License Renewal'}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        {/* Category & Amount Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <Label required>Category</Label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label required>Amount (INR ₹)</Label>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>

        {/* Date, Payment Method & Tax Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <Label required>Transaction Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="UPI">UPI</option>
              <option value="Credit Card">Corporate Credit Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Petty Cash</option>
              <option value="Stripe">Stripe / Payment Gateway</option>
            </Select>
          </div>

          <div>
            <Label>Bank Account</Label>
            <Select
              value={form.bankAccountId}
              onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            >
              <option value="">Default Primary Bank</option>
              {bankAccounts.map((b: any) => (
                <option key={b._id} value={b._id}>
                  {b.name} ({b.bank} - *{b.accountLast4})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Related Party Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {form.type === 'revenue' ? (
            <div>
              <Label>Client (Payer)</Label>
              <Select
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              >
                <option value="">Select Client (Optional)</option>
                {clients.map((c: any) => (
                  <option key={c._id} value={c._id}>
                    {c.company ? `${c.company} (${c.name})` : c.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div>
              <Label>Vendor / Payee</Label>
              <Select
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              >
                <option value="">Select Vendor (Optional)</option>
                {vendors.map((v: any) => (
                  <option key={v._id} value={v._id}>
                    {v.name} ({v.category || 'Vendor'})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label>Related Employee / Team Member</Label>
            <Select
              value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}
            >
              <option value="">Select Employee (Optional)</option>
              {employees.map((emp: any) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.department || emp.role})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Description & Notes */}
        <div>
          <Label>Description & Memo</Label>
          <Input
            placeholder="Detailed description for financial audit..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Attachment Upload (Receipt / Invoice / PDF) */}
        <div>
          <Label>Receipt or Document Attachment (PDF, Image)</Label>
          {existingAttachment && !attachmentFile ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 text-teal-600 shrink-0" />
                <span className="truncate font-medium">{existingAttachment.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setExistingAttachment(null)}
                className="text-rose-500 hover:text-rose-700 p-1"
                title="Remove attachment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                id="tx-attachment-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      toast.error('File size must be under 10MB');
                      return;
                    }
                    setAttachmentFile(f);
                  }
                }}
              />
              <label
                htmlFor="tx-attachment-input"
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 hover:border-teal-500 bg-white hover:bg-teal-50/30 text-xs font-semibold text-slate-600 cursor-pointer transition-all"
              >
                <Upload className="h-4 w-4 text-teal-600" />
                <span>{attachmentFile ? attachmentFile.name : 'Choose receipt or invoice (PDF, JPG, PNG up to 10MB)'}</span>
              </label>
              {attachmentFile && (
                <button
                  type="button"
                  onClick={() => setAttachmentFile(null)}
                  className="absolute right-3 top-3 text-rose-500 hover:text-rose-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
