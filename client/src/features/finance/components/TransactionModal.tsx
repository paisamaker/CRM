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
  Sparkles,
  Receipt,
  Scan,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/auth';
import { DocumentScannerDropzone, type ScanResultPayload } from './DocumentScannerDropzone';
import { syncFinanceQueries } from '../financeSync';

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
  invoiceNumber?: string;
  documentHash?: string;
  scannedDocument?: any;
  documentMetadata?: any;
  attachment?: { name: string; url: string; mime?: string; size?: number; hash?: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialType?: 'revenue' | 'expense';
  editingTransaction?: TransactionItem | null;
  autoOpenScanner?: boolean;
}

export function TransactionModal({
  open,
  onClose,
  initialType = 'expense',
  editingTransaction,
  autoOpenScanner = false,
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

  // AI Document Scanning State
  const [showScanner, setShowScanner] = useState(false);
  const [scannedMeta, setScannedMeta] = useState<{
    invoiceNumber?: string;
    documentHash?: string;
    scannedDocumentId?: string;
    documentMetadata?: any;
    engine?: string;
  } | null>(null);
  const [uncertainFields, setUncertainFields] = useState<Record<string, boolean>>({});
  const [extractedLineItems, setExtractedLineItems] = useState<Array<any>>([]);
  const [showLineItems, setShowLineItems] = useState(false);

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
    queryKey: ['finance-salary-employees'],
    queryFn: async () => {
      try {
        const res = await api.get('/finance/salaries');
        return res.data.data?.items || [];
      } catch {
        const res = await api.get('/users', { params: { limit: 100, status: 'active' } });
        return res.data.data?.items || [];
      }
    },
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
      setScannedMeta(
        editingTransaction.scannedDocument
          ? {
              invoiceNumber: editingTransaction.invoiceNumber,
              documentHash: editingTransaction.documentHash,
              scannedDocumentId: typeof editingTransaction.scannedDocument === 'object' ? editingTransaction.scannedDocument._id : editingTransaction.scannedDocument,
              documentMetadata: editingTransaction.documentMetadata,
            }
          : null
      );
      setShowScanner(false);
      setUncertainFields({});
      setExtractedLineItems([]);
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
      setScannedMeta(null);
      setShowScanner(autoOpenScanner);
      setUncertainFields({});
      setExtractedLineItems([]);
    }
    setAttachmentFile(null);
  }, [editingTransaction, initialType, open, autoOpenScanner]);

  const categories =
    form.type === 'expense'
      ? catData?.expense || ['Software Purchase', 'Office Expenses', 'Marketing', 'Other Expenses']
      : catData?.income || ['Client Payment', 'Project Revenue', 'Sales Revenue', 'Other Income'];

  // Handle scanned document result
  const handleScanComplete = (result: ScanResultPayload) => {
    const data = result.extractedData;
    const conf = result.confidence || { overall: 0.8, fields: {} };
    const fileHint = `${result.fileName || ''} ${data.description || ''} ${data.documentType || ''}`.toLowerCase();
    const isPayslip =
      data.documentType === 'salary_slip' ||
      data.documentType === 'salary' ||
      /payslip|salary\s*slip|salary\s*payout|net\s*salary/.test(fileHint) ||
      /salary/i.test(data.suggestedCategory || '');

    // Payslips are always company expense (never client income)
    const newType: 'expense' | 'revenue' = isPayslip
      ? 'expense'
      : data.suggestedTransactionType ||
        (data.documentType === 'receipt' || data.documentType === 'invoice' ? 'expense' : 'revenue');

    const catList: string[] =
      newType === 'expense'
        ? catData?.expense || [
            'Salary',
            'Software Purchase',
            'Office Expenses',
            'Marketing',
            'Other Expenses',
          ]
        : catData?.income || ['Client Payment', 'Project Revenue', 'Sales Revenue', 'Other Income'];

    const resolveCategory = (suggested?: string) => {
      if (isPayslip) {
        return (
          catList.find((c) => /^salary$/i.test(c)) ||
          catList.find((c) => /stipend|payroll|salary/i.test(c)) ||
          'Salary'
        );
      }
      if (!suggested) return catList[0] || form.category;
      const exact = catList.find((c) => c.toLowerCase() === suggested.toLowerCase());
      if (exact) return exact;
      const fuzzy = catList.find(
        (c) =>
          c.toLowerCase().includes(suggested.toLowerCase()) ||
          suggested.toLowerCase().includes(c.toLowerCase())
      );
      return fuzzy || catList[0] || form.category;
    };

    const matchedCategory = resolveCategory(data.suggestedCategory);

    let matchedVendorId = form.vendor;
    let matchedClientId = form.client;
    let matchedEmployeeId = form.employee;

    if (data.vendor?.name && vendors.length > 0 && !isPayslip) {
      const vFound = vendors.find(
        (v: any) =>
          v.name?.toLowerCase().includes(data.vendor!.name!.toLowerCase()) ||
          data.vendor!.name!.toLowerCase().includes(v.name?.toLowerCase())
      );
      if (vFound) matchedVendorId = vFound._id;
    }

    if (data.customer?.name && clients.length > 0 && !isPayslip) {
      const cFound = clients.find(
        (c: any) =>
          c.name?.toLowerCase().includes(data.customer!.name!.toLowerCase()) ||
          c.company?.toLowerCase().includes(data.customer!.name!.toLowerCase())
      );
      if (cFound) matchedClientId = cFound._id;
    }

    // Match employee for salary payouts
    if (isPayslip && data.vendor?.name && employees.length > 0) {
      const needle = data.vendor.name.toLowerCase();
      const eFound = employees.find(
        (e: any) =>
          e.name?.toLowerCase() === needle ||
          e.name?.toLowerCase().includes(needle) ||
          needle.includes(e.name?.toLowerCase() || '')
      );
      if (eFound) matchedEmployeeId = eFound._id;
    }

    const uncertain: Record<string, boolean> = {};
    const hasAmount =
      (typeof data.grandTotal === 'number' && data.grandTotal > 0) ||
      (typeof data.amountPaid === 'number' && data.amountPaid > 0) ||
      (typeof data.subtotal === 'number' && data.subtotal > 0);
    if (
      !hasAmount ||
      (conf.fields['amount'] && conf.fields['amount'] < 0.65) ||
      (conf.fields['grandTotal'] && conf.fields['grandTotal'] < 0.65)
    ) {
      uncertain['amount'] = true;
    }
    if (!data.documentDate || (conf.fields['documentDate'] && conf.fields['documentDate'] < 0.65)) {
      uncertain['date'] = true;
    }
    if (data.taxableAmount && !data.totalTax && conf.fields['totalTax'] && conf.fields['totalTax'] < 0.65) {
      uncertain['taxAmount'] = true;
    }

    setUncertainFields(uncertain);

    const resolvedAmount =
      (typeof data.grandTotal === 'number' && data.grandTotal > 0 && data.grandTotal) ||
      (typeof data.amountPaid === 'number' && data.amountPaid > 0 && data.amountPaid) ||
      (typeof data.subtotal === 'number' && data.subtotal > 0 && data.subtotal) ||
      null;

    const docNum = data.invoiceNumber || data.billNumber || data.receiptNumber || '';
    const partyName = (newType === 'expense' ? data.vendor?.name : data.customer?.name) || '';
    const periodFromFile = (result.fileName || '').match(/(20\d{2}-\d{2})/)?.[1];
    const suggestedTitle = isPayslip
      ? `Salary: ${partyName || 'Employee'}${periodFromFile ? ` (${periodFromFile})` : ''}`
      : data.description?.startsWith('Salary')
        ? data.description.slice(0, 80)
        : docNum
          ? `${docNum}${partyName ? ` - ${partyName}` : ''}`
          : partyName
            ? `${partyName} ${newType === 'expense' ? 'Bill' : 'Payment'}`
            : data.description?.slice(0, 80) ||
              (resolvedAmount ? `${matchedCategory} ₹${resolvedAmount}` : `${matchedCategory} Document`);

    const rawMethod = (data.paymentMethod || '').toLowerCase();
    let paymentMethod = data.paymentMethod || '';
    if (/upi|gpay|phonepe|paytm|bhim/.test(rawMethod)) paymentMethod = 'UPI';
    else if (/card|visa|master|rupay|credit|debit/.test(rawMethod)) paymentMethod = 'Credit Card';
    else if (/cash/.test(rawMethod)) paymentMethod = 'Cash';
    else if (/neft|rtgs|imps|bank|transfer|net\s*banking/.test(rawMethod)) paymentMethod = 'Bank Transfer';
    if (isPayslip && !paymentMethod) paymentMethod = 'Bank Transfer';

    setForm((prev) => ({
      ...prev,
      type: newType,
      category: matchedCategory,
      amount: resolvedAmount != null ? String(resolvedAmount) : prev.amount,
      taxAmount: isPayslip
        ? '0'
        : data.totalTax != null && data.totalTax > 0
          ? String(data.totalTax)
          : prev.taxAmount || '0',
      title: suggestedTitle || prev.title,
      description:
        data.description ||
        data.notes ||
        (data.vendor?.address ? `Address: ${data.vendor.address}` : prev.description),
      date: data.documentDate || prev.date,
      paymentMethod: paymentMethod || prev.paymentMethod || 'UPI',
      vendor: isPayslip ? '' : matchedVendorId,
      client: isPayslip ? '' : matchedClientId,
      employee: matchedEmployeeId || prev.employee,
      notes: [
        isPayslip ? 'Salary payout from scanned payslip' : '',
        docNum ? `Scanned Doc #${docNum}` : '',
        data.vendor?.gstin ? `Vendor GSTIN: ${data.vendor.gstin}` : '',
        data.vendor?.name && isPayslip ? `Employee: ${data.vendor.name}` : '',
        data.vendor?.name && !isPayslip && !matchedVendorId ? `Payee: ${data.vendor.name}` : '',
        data.paymentStatus ? `Payment status: ${data.paymentStatus}` : '',
        result.extractionEngine ? `OCR: ${result.extractionEngine}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    }));

    // Attach document automatically
    setExistingAttachment({
      name: result.fileName,
      url: result.fileUrl,
      mime: result.fileMime,
      size: result.fileSize,
      hash: result.documentHash,
    });
    setAttachmentFile(null);

    // Metadata
    setScannedMeta({
      invoiceNumber: docNum || undefined,
      documentHash: result.documentHash,
      scannedDocumentId: result.scannedDocumentId,
      documentMetadata: {
        vendor: data.vendor,
        customer: data.customer,
        subtotal: data.subtotal,
        taxes: {
          cgst: data.cgst,
          sgst: data.sgst,
          igst: data.igst,
          totalTax: data.totalTax,
        },
        items: data.items,
        confidence: conf,
      },
      engine: result.extractionEngine,
    });

    if (data.items && data.items.length > 0) {
      setExtractedLineItems(data.items);
      setShowLineItems(true);
    }
  };

  // Mutation to save transaction
  const mutation = useMutation({
    mutationFn: async () => {
      let attachmentPayload = existingAttachment;

      // Upload new attachment if manual file selected
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

      const numAmount = Number(form.amount);
      if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Please enter a valid amount greater than 0');
      }

      let cleanDate = form.date?.trim() || new Date().toISOString().slice(0, 10);
      if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanDate)) {
        const parts = cleanDate.split(/[/\-.]/);
        cleanDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }

      const payload: any = {
        type: form.type,
        category: form.category || categories[0],
        amount: numAmount,
        taxAmount: Number(form.taxAmount || 0),
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        date: cleanDate,
        paymentMethod: form.paymentMethod || 'Bank Transfer',
        client: form.client || undefined,
        vendor: form.vendor || undefined,
        employee: form.employee || undefined,
        bankAccountId: form.bankAccountId || undefined,
        notes: form.notes || undefined,
        attachment: attachmentPayload || undefined,
        invoiceNumber: scannedMeta?.invoiceNumber || undefined,
        documentHash: scannedMeta?.documentHash || undefined,
        scannedDocument: scannedMeta?.scannedDocumentId || undefined,
        documentMetadata: scannedMeta?.documentMetadata || undefined,
        submitForApproval: role === 'ceo' ? false : form.type === 'expense',
      };

      if (isEditing) {
        return (await api.patch(`/finance/transactions/${editingTransaction!._id}`, payload)).data;
      }
      return (await api.post('/finance/transactions', payload)).data;
    },
    onSuccess: async () => {
      toast.success(
        isEditing
          ? 'Transaction updated successfully'
          : role === 'ceo'
          ? 'Transaction recorded successfully'
          : form.type === 'expense'
          ? 'Expense submitted for CEO approval'
          : 'Transaction recorded successfully'
      );
      await syncFinanceQueries(qc);
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Transaction' : `Record ${form.type === 'revenue' ? 'Income' : 'Expense'}`}
      description="Enter transaction details or scan a receipt/bill to auto-fill"
      variant="dialog"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[var(--fg-muted)]">
            {scannedMeta?.engine && (
              <span className="flex items-center gap-1 text-teal-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" /> Parsed via {scannedMeta.engine}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={form.type === 'revenue' ? 'teal' : 'primary'}
              disabled={!form.amount || Number(form.amount) <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Confirm & Save Transaction'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Prominent Scan Bill / Receipt Trigger (Only for new transactions) */}
        {!isEditing && (
          <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-purple-500/10 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--fg-primary)] flex items-center gap-1.5">
                    <span>AI Bill & Receipt Scanner</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
                      OCR
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    Upload PDF or image to extract amounts, dates, GST, and vendor details automatically
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                variant={showScanner ? 'outline' : 'teal'}
                className="text-xs gap-1.5 shadow-sm"
                onClick={() => setShowScanner(!showScanner)}
              >
                <Scan className="w-3.5 h-3.5" />
                <span>{showScanner ? 'Hide Scanner' : 'Scan Bill / Receipt'}</span>
              </Button>
            </div>

            {/* Collapsible Dropzone */}
            {showScanner && (
              <div className="mt-3.5 pt-3 border-t border-teal-500/20">
                <DocumentScannerDropzone
                  onScanComplete={(res) => {
                    handleScanComplete(res);
                  }}
                  onCancel={() => setShowScanner(false)}
                />
              </div>
            )}
          </div>
        )}

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
          <div className="flex items-center justify-between mb-1">
            <Label required>Title / Purpose</Label>
            {scannedMeta?.invoiceNumber && (
              <span className="text-[10px] text-teal-400 font-mono">
                Doc Ref: {scannedMeta.invoiceNumber}
              </span>
            )}
          </div>
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
            <div className="flex items-center justify-between mb-1">
              <Label required>Amount (INR ₹)</Label>
              {uncertainFields['amount'] && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Please Verify
                </span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.amount}
              className={uncertainFields['amount'] ? 'border-amber-500 focus:ring-amber-500' : ''}
              onChange={(e) => {
                setForm({ ...form, amount: e.target.value });
                if (uncertainFields['amount']) {
                  setUncertainFields((u) => ({ ...u, amount: false }));
                }
              }}
            />
          </div>
        </div>

        {/* Tax Amount & Date & Payment Method */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Tax / GST (INR ₹)</Label>
              {uncertainFields['taxAmount'] && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded">Verify</span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.taxAmount}
              onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label required>Transaction Date</Label>
              {uncertainFields['date'] && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded">Verify</span>
              )}
            </div>
            <Input
              type="date"
              value={form.date}
              className={uncertainFields['date'] ? 'border-amber-500' : ''}
              onChange={(e) => {
                setForm({ ...form, date: e.target.value });
                if (uncertainFields['date']) {
                  setUncertainFields((u) => ({ ...u, date: false }));
                }
              }}
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
        </div>

        {/* Bank Account Selection */}
        <div>
          <Label>Settlement Bank Account</Label>
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

        {/* Extracted Line Items Review (If Document had items) */}
        {extractedLineItems.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 text-xs font-semibold text-[var(--fg-primary)] hover:bg-[var(--surface)] transition-colors"
              onClick={() => setShowLineItems(!showLineItems)}
            >
              <span className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-teal-400" />
                <span>Extracted Items Breakdown ({extractedLineItems.length} items detected)</span>
              </span>
              {showLineItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showLineItems && (
              <div className="p-3 pt-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--fg-muted)]">
                      <th className="py-1.5 pr-2">Item Description</th>
                      <th className="py-1.5 px-2 text-right">Qty</th>
                      <th className="py-1.5 px-2 text-right">Unit Price</th>
                      <th className="py-1.5 pl-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedLineItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-[var(--border-subtle)]/50">
                        <td className="py-1.5 pr-2 text-[var(--fg-primary)] font-medium">{item.name}</td>
                        <td className="py-1.5 px-2 text-right text-[var(--fg-muted)]">{item.quantity ?? '-'}</td>
                        <td className="py-1.5 px-2 text-right text-[var(--fg-muted)]">
                          {item.unitPrice ? `₹${item.unitPrice}` : '-'}
                        </td>
                        <td className="py-1.5 pl-2 text-right font-semibold text-[var(--fg-primary)]">
                          {item.lineTotal ? `₹${item.lineTotal}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
          <Label>Receipt or Document Attachment</Label>
          {existingAttachment && !attachmentFile ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-xs text-[var(--fg-primary)]">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 text-teal-400 shrink-0" />
                <span className="truncate font-medium">{existingAttachment.name}</span>
                {existingAttachment.url && (
                  <a
                    href={existingAttachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 hover:underline flex items-center gap-1 text-[11px] ml-2"
                  >
                    <Eye className="w-3 h-3" /> View original
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setExistingAttachment(null)}
                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10"
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
                    if (f.size > 15 * 1024 * 1024) {
                      toast.error('File size must be under 15MB');
                      return;
                    }
                    setAttachmentFile(f);
                  }
                }}
              />
              <label
                htmlFor="tx-attachment-input"
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--border-subtle)] hover:border-teal-500 bg-[var(--surface-sunken)] hover:bg-teal-500/5 text-xs font-semibold text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-all"
              >
                <Upload className="h-4 w-4 text-teal-400" />
                <span>{attachmentFile ? attachmentFile.name : 'Choose receipt or invoice file (PDF, JPG, PNG up to 15MB)'}</span>
              </label>
              {attachmentFile && (
                <button
                  type="button"
                  onClick={() => setAttachmentFile(null)}
                  className="absolute right-3 top-3 text-rose-400 hover:text-rose-300"
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
