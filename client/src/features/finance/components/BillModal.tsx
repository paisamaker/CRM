import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  X,
  Building2,
  Calendar,
  Receipt,
  FileCheck,
  Sparkles,
  Scan,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { DocumentScannerDropzone, type ScanResultPayload } from './DocumentScannerDropzone';
import { syncFinanceQueries } from '../financeSync';

export interface BillItem {
  _id?: string;
  billNumber: string;
  title: string;
  type: 'payable' | 'receivable';
  category: string;
  amount: number | string;
  taxAmount?: number | string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  outstandingAmount?: number | string;
  billDate: string;
  dueDate?: string;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';
  paymentMethod?: string;
  vendorName?: string;
  clientName?: string;
  vendor?: string;
  client?: string;
  description?: string;
  notes?: string;
  scannedDocument?: any;
  documentHash?: string;
  attachment?: {
    name: string;
    url: string;
    mime?: string;
    size?: number;
    hash?: string;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialType?: 'payable' | 'receivable';
  editingBill?: BillItem | null;
  autoOpenScanner?: boolean;
}

export function BillModal({ open, onClose, initialType = 'payable', editingBill, autoOpenScanner = false }: Props) {
  const qc = useQueryClient();
  const isEditing = !!editingBill?._id;

  const [form, setForm] = useState({
    type: initialType,
    billNumber: '',
    title: '',
    partyName: '',
    category: '',
    amount: '',
    taxAmount: '0',
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    paymentMethod: 'Bank Transfer',
    paymentStatus: 'unpaid',
    description: '',
    notes: '',
  });

  const [attachment, setAttachment] = useState<{
    name: string;
    url: string;
    mime?: string;
    size?: number;
    hash?: string;
  } | null>(null);

  const [uploading, setUploading] = useState(false);

  // AI Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scannedMeta, setScannedMeta] = useState<{
    scannedDocumentId?: string;
    documentHash?: string;
    engine?: string;
  } | null>(null);
  const [uncertainFields, setUncertainFields] = useState<Record<string, boolean>>({});

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
  });

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => (await api.get('/clients', { params: { limit: 100 } })).data.data,
  });

  // Auto-generate bill number on new bill
  useEffect(() => {
    if (open) {
      if (editingBill) {
        setForm({
          type: editingBill.type || initialType,
          billNumber: editingBill.billNumber || '',
          title: editingBill.title || '',
          partyName: editingBill.type === 'receivable' ? editingBill.clientName || '' : editingBill.vendorName || '',
          category: editingBill.category || '',
          amount: String(editingBill.amount ?? ''),
          taxAmount: String(editingBill.taxAmount ?? '0'),
          billDate: editingBill.billDate ? new Date(editingBill.billDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          dueDate: editingBill.dueDate ? new Date(editingBill.dueDate).toISOString().slice(0, 10) : '',
          paymentMethod: editingBill.paymentMethod || 'Bank Transfer',
          paymentStatus: editingBill.paymentStatus || 'unpaid',
          description: editingBill.description || '',
          notes: editingBill.notes || '',
        });
        setAttachment(editingBill.attachment || null);
        setScannedMeta(
          editingBill.scannedDocument
            ? {
                scannedDocumentId: typeof editingBill.scannedDocument === 'object' ? editingBill.scannedDocument._id : editingBill.scannedDocument,
                documentHash: editingBill.documentHash,
              }
            : null
        );
        setShowScanner(false);
        setUncertainFields({});
      } else {
        const prefix = initialType === 'receivable' ? 'REC' : 'BILL';
        const rand = Math.floor(1000 + Math.random() * 9000);
        const year = new Date().getFullYear();
        setForm({
          type: initialType,
          billNumber: `${prefix}-${year}-${rand}`,
          title: '',
          partyName: '',
          category: '',
          amount: '',
          taxAmount: '0',
          billDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
          paymentMethod: 'Bank Transfer',
          paymentStatus: 'unpaid',
          description: '',
          notes: '',
        });
        setAttachment(null);
        setScannedMeta(null);
        setShowScanner(autoOpenScanner);
        setUncertainFields({});
      }
    }
  }, [open, editingBill, initialType, autoOpenScanner]);

  const categories =
    form.type === 'receivable'
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

  // Set default category if empty
  useEffect(() => {
    if (!form.category && categories.length > 0) {
      setForm((f) => ({ ...f, category: categories[0] }));
    }
  }, [categories, form.category]);

  // Handle scanned document result for bill
  const handleScanComplete = (result: ScanResultPayload) => {
    const data = result.extractedData;
    const conf = result.confidence || { overall: 0.8, fields: {} };

    // Identify target bill type
    const newType = data.suggestedTransactionType === 'revenue' ? 'receivable' : 'payable';

    // Best matching category
    let matchedCategory = form.category;
    const catList = newType === 'receivable'
      ? categoriesData?.incomeCategories || ['Client Payment', 'Project Revenue', 'Service Revenue', 'Other Income']
      : categoriesData?.expenseCategories || ['Software Purchase', 'Office Expenses', 'Marketing', 'Vendor Payment', 'Other Expenses'];

    if (data.suggestedCategory && catList.includes(data.suggestedCategory)) {
      matchedCategory = data.suggestedCategory;
    } else if (catList.length > 0) {
      matchedCategory = catList[0];
    }

    const party = (newType === 'payable' ? data.vendor?.name : data.customer?.name) || '';
    const invoiceNum = data.invoiceNumber || data.billNumber || form.billNumber;

    // Track uncertainty
    const uncertain: Record<string, boolean> = {};
    if (!data.grandTotal || (conf.fields['grandTotal'] && conf.fields['grandTotal'] < 0.65)) {
      uncertain['amount'] = true;
    }
    if (!data.documentDate || (conf.fields['documentDate'] && conf.fields['documentDate'] < 0.65)) {
      uncertain['billDate'] = true;
    }
    setUncertainFields(uncertain);

    setForm((prev) => ({
      ...prev,
      type: newType,
      billNumber: invoiceNum,
      partyName: party || prev.partyName,
      title: `${invoiceNum}${party ? ` - ${party}` : ''}`,
      category: matchedCategory,
      amount: data.grandTotal ? String(data.grandTotal) : data.subtotal ? String(data.subtotal) : prev.amount,
      taxAmount: data.totalTax ? String(data.totalTax) : '0',
      billDate: data.documentDate || prev.billDate,
      dueDate: data.dueDate || prev.dueDate,
      paymentStatus: (data.paymentStatus as any) || 'unpaid',
      paymentMethod: data.paymentMethod || prev.paymentMethod,
      description: data.description || (data.vendor?.address ? `Vendor Address: ${data.vendor.address}` : prev.description),
      notes: [
        prev.notes,
        data.vendor?.gstin ? `Vendor GSTIN: ${data.vendor.gstin}` : '',
        data.customer?.gstin ? `Customer GSTIN: ${data.customer.gstin}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    }));

    // Set attachment automatically
    setAttachment({
      name: result.fileName,
      url: result.fileUrl,
      mime: result.fileMime,
      size: result.fileSize,
      hash: result.documentHash,
    });

    setScannedMeta({
      scannedDocumentId: result.scannedDocumentId,
      documentHash: result.documentHash,
      engine: result.extractionEngine,
    });
  };

  // Handle manual attachment upload
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
      setAttachment({
        name: uploaded.originalName || file.name,
        url: uploaded.url,
        mime: uploaded.mimeType || file.type,
        size: uploaded.size || file.size,
      });
      toast.success('Document uploaded');
    } catch (err: any) {
      toast.error(getErrorMessage(err) || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const calculatedTotal = (Number(form.amount) || 0) + (Number(form.taxAmount) || 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const numAmount = Number(form.amount);
      if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Please enter a valid amount greater than 0');
      }

      let cleanBillDate = form.billDate?.trim() || new Date().toISOString().slice(0, 10);
      if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanBillDate)) {
        const parts = cleanBillDate.split(/[/\-.]/);
        cleanBillDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }

      let cleanDueDate = form.dueDate?.trim() || undefined;
      if (cleanDueDate && /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanDueDate)) {
        const parts = cleanDueDate.split(/[/\-.]/);
        cleanDueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }

      const party = form.partyName?.trim() || (form.type === 'receivable' ? 'Client' : 'Vendor');

      const payload: any = {
        billNumber: form.billNumber?.trim() || undefined,
        title: form.title?.trim() || `${party} - ${form.category}`,
        partyName: party,
        type: form.type,
        category: form.category || (form.type === 'receivable' ? 'Client Payment' : 'Office Expenses'),
        amount: numAmount,
        taxAmount: Number(form.taxAmount) || 0,
        billDate: cleanBillDate,
        dueDate: cleanDueDate,
        paymentStatus: form.paymentStatus || 'unpaid',
        paymentMethod: form.paymentMethod || 'Bank Transfer',
        description: form.description?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        attachment: attachment || undefined,
        scannedDocument: scannedMeta?.scannedDocumentId || undefined,
        documentHash: scannedMeta?.documentHash || undefined,
      };

      if (form.type === 'receivable') {
        payload.clientName = party;
      } else {
        payload.vendorName = party;
      }

      if (isEditing) {
        return (await api.patch(`/finance/bills/${editingBill!._id}`, payload)).data;
      }
      return (await api.post('/finance/bills', payload)).data;
    },
    onSuccess: async () => {
      toast.success(isEditing ? 'Bill updated' : 'Bill created successfully');
      await syncFinanceQueries(qc);
      onClose();
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to save bill');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{isEditing ? 'Edit Bill / Invoice' : 'New Bill / Invoice'}</div>
            <div className="text-xs text-[var(--fg-secondary)] font-normal">
              Enter bill details or scan document with AI to extract fields automatically
            </div>
          </div>
        </div>
      }
      variant="dialog"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[var(--fg-secondary)]">
            Total Amount:{' '}
            <span className="font-semibold text-[var(--fg-primary)]">
              ₹{calculatedTotal.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="teal"
              disabled={
                !form.title.trim() ||
                !form.billNumber.trim() ||
                !form.amount ||
                Number(form.amount) <= 0 ||
                saveMutation.isPending
              }
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving…' : isEditing ? 'Update Bill' : 'Confirm & Create Bill'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-sm">
        {/* Prominent Scan Bill Option (Only for new bills) */}
        {!isEditing && (
          <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-transparent p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--fg-primary)] flex items-center gap-1.5">
                    <span>Scan Vendor Bill or Client Invoice</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
                      AI OCR
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    Upload bill file to automatically extract invoice number, totals, GST, and due dates
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
                <span>{showScanner ? 'Hide Scanner' : 'Scan Bill'}</span>
              </Button>
            </div>

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

        {/* Bill Type Selector */}
        <div className="grid grid-cols-2 gap-3 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          <button
            type="button"
            className={`py-2 px-3 text-center rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
              form.type === 'payable'
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setForm({ ...form, type: 'payable' })}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Vendor Bill (Payable)
          </button>
          <button
            type="button"
            className={`py-2 px-3 text-center rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
              form.type === 'receivable'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setForm({ ...form, type: 'receivable' })}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Client Invoice (Receivable)
          </button>
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Bill / Invoice Number *</Label>
            <Input
              placeholder="e.g. BILL-2026-001"
              value={form.billNumber}
              onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
            />
          </div>

          <div>
            <Label>Bill Title / Purpose *</Label>
            <Input
              placeholder="e.g. AWS Cloud Hosting - Oct 2026"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
        </div>

        {/* Party and Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{form.type === 'receivable' ? 'Client / Customer Name' : 'Vendor / Supplier Name'}</Label>
            <div className="relative">
              <Input
                placeholder={form.type === 'receivable' ? 'Client or company name' : 'Vendor or business name'}
                value={form.partyName}
                onChange={(e) => setForm({ ...form, partyName: e.target.value })}
              />
              {clientsData?.clients?.length > 0 && form.type === 'receivable' && (
                <datalist id="clients-datalist">
                  {clientsData.clients.map((c: any) => (
                    <option key={c._id} value={c.name || c.company} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          <div>
            <Label>Financial Category *</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Amounts and Tax */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Taxable / Net Amount (INR ₹) *</Label>
              {uncertainFields['amount'] && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Verify
                </span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.amount}
              className={uncertainFields['amount'] ? 'border-amber-500' : ''}
              onChange={(e) => {
                setForm({ ...form, amount: e.target.value });
                if (uncertainFields['amount']) {
                  setUncertainFields((u) => ({ ...u, amount: false }));
                }
              }}
            />
          </div>

          <div>
            <Label>Tax / GST Amount (INR ₹)</Label>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.taxAmount}
              onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Bill / Issue Date *</Label>
              {uncertainFields['billDate'] && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded">Verify</span>
              )}
            </div>
            <Input
              type="date"
              value={form.billDate}
              className={uncertainFields['billDate'] ? 'border-amber-500' : ''}
              onChange={(e) => {
                setForm({ ...form, billDate: e.target.value });
                if (uncertainFields['billDate']) {
                  setUncertainFields((u) => ({ ...u, billDate: false }));
                }
              }}
            />
          </div>

          <div>
            <Label>Payment Due Date</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
        </div>

        {/* Payment Setup */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Payment Method</Label>
            <Select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
              <option value="UPI">UPI</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
            </Select>
          </div>

          <div>
            <Label>Payment Status</Label>
            <Select
              value={form.paymentStatus}
              onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as any })}
            >
              <option value="unpaid">Unpaid (Awaiting settlement)</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid in Full</option>
            </Select>
          </div>
        </div>

        {/* Description & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Description / Item details</Label>
            <Input
              placeholder="Description of products or services billed"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <Label>Internal Notes</Label>
            <Input
              placeholder="Internal reminders or PO references"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {/* Supporting Attachment Upload */}
        <div>
          <Label>Supporting Document / Bill Attachment (PDF or Images)</Label>
          {attachment ? (
            <div className="flex items-center justify-between p-3 rounded-xl border border-teal-500/30 bg-teal-500/10">
              <div className="flex items-center gap-2.5 truncate">
                <FileCheck className="w-5 h-5 text-teal-400 shrink-0" />
                <div className="truncate">
                  <div className="font-medium text-xs truncate text-[var(--fg-primary)]">{attachment.name}</div>
                  <div className="text-[10px] text-[var(--fg-muted)]">
                    {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Attached'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-400 hover:underline flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </a>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-white/10 text-[var(--fg-muted)] hover:text-rose-400"
                  onClick={() => setAttachment(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)]/50 bg-[var(--surface-sunken)]/40 hover:bg-[var(--surface-sunken)] cursor-pointer transition-colors group">
              <Upload className="w-6 h-6 text-[var(--fg-muted)] group-hover:text-[var(--accent)] mb-1 transition-colors" />
              <span className="text-xs font-medium text-[var(--fg-primary)]">
                {uploading ? 'Uploading document…' : 'Click to upload Bill PDF or Receipt Image'}
              </span>
              <span className="text-[10px] text-[var(--fg-muted)] mt-0.5">
                Supports PDF, JPG, PNG, WebP (Max 15MB)
              </span>
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
