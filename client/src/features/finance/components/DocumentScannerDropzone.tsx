import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Sparkles,
  Eye,
  Loader2,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

export interface ExtractedFinancialData {
  documentType?:
    | 'invoice'
    | 'receipt'
    | 'bill'
    | 'credit_note'
    | 'debit_note'
    | 'salary'
    | 'salary_slip'
    | 'tax_invoice'
    | 'other';
  suggestedTransactionType?: 'expense' | 'revenue';
  suggestedCategory?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  billNumber?: string;
  documentDate?: string;
  dueDate?: string;
  currency?: string;
  vendor?: {
    name?: string;
    address?: string;
    gstin?: string;
  };
  customer?: {
    name?: string;
    address?: string;
    gstin?: string;
  };
  subtotal?: number;
  discount?: number;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  otherTaxes?: number;
  totalTax?: number;
  grandTotal?: number;
  amountPaid?: number;
  outstandingAmount?: number;
  paymentMethod?: string;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid';
  description?: string;
  notes?: string;
  items?: Array<{
    name: string;
    quantity?: number;
    unitPrice?: number;
    taxRate?: number;
    lineTotal?: number;
  }>;
}

export interface ScanResultPayload {
  scannedDocumentId: string;
  documentHash: string;
  extractedData: ExtractedFinancialData;
  confidence: {
    overall: number;
    fields: Record<string, number>;
  };
  status: string;
  extractionEngine: string;
  duplicateWarning?: {
    isDuplicate: boolean;
    reason?: string;
    matchedType?: string;
    matchedId?: string;
    details?: any;
  } | null;
  fileUrl: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
}

interface Props {
  onScanComplete: (result: ScanResultPayload) => void;
  onCancel?: () => void;
  compact?: boolean;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_SIZE_MB = 15;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export function DocumentScannerDropzone({ onScanComplete, onCancel, compact = false }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [scanStep, setScanStep] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [duplicateAlert, setDuplicateAlert] = useState<ScanResultPayload['duplicateWarning'] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  const validateAndProcessFile = (file: File) => {
    setErrorDetails(null);
    setDuplicateAlert(null);

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      const err = 'Invalid file type. Please upload a PDF, JPG, PNG, or WEBP document.';
      toast.error(err);
      setErrorDetails(err);
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      const err = `File size exceeds the limit (${MAX_SIZE_MB}MB). Please choose a smaller document.`;
      toast.error(err);
      setErrorDetails(err);
      return;
    }

    setSelectedFile(file);

    // Create preview if image
    if (file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview(previewUrl);
    } else {
      setFilePreview(null);
    }

    // Auto-trigger scanning
    startDocumentScan(file);
  };

  const startDocumentScan = async (file: File) => {
    try {
      abortControllerRef.current = new AbortController();
      setScanStep('uploading');
      setScanStatusMessage('Uploading document securely to the vault...');
      setProgressPercent(20);

      const formData = new FormData();
      // Must match server multer field name: scanUpload.single('file')
      formData.append('file', file);

      // Transition to processing status message
      setTimeout(() => {
        setScanStep('processing');
        setScanStatusMessage('Running AI financial OCR extraction & GST analysis...');
        setProgressPercent(60);
      }, 900);

      const response = await api.post('/finance/documents/scan', formData, {
        // Do NOT set Content-Type manually — axios must add the multipart boundary
        signal: abortControllerRef.current.signal,
        timeout: 120_000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 40) / progressEvent.total);
            setProgressPercent(10 + pct);
          }
        },
      });

      const resData = response.data;
      if (resData.success && resData.data) {
        setProgressPercent(100);
        setScanStep('done');
        setScanStatusMessage('Financial fields extracted successfully!');

        const payload: ScanResultPayload = resData.data;

        if (payload.duplicateWarning?.isDuplicate) {
          setDuplicateAlert(payload.duplicateWarning);
          toast.warning('Duplicate Document Warning: ' + payload.duplicateWarning.reason);
        } else {
          toast.success(`Scanned via ${payload.extractionEngine || 'AI Engine'}`);
        }

        onScanComplete(payload);
      } else {
        throw new Error(resData.message || 'Failed to scan document.');
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        toast.info('Scan cancelled.');
        setScanStep('idle');
        setSelectedFile(null);
        return;
      }
      const msg = getErrorMessage(err);
      setErrorDetails(msg);
      setScanStep('error');
      setScanStatusMessage('Scan failed: ' + msg);
      toast.error(msg);
    }
  };

  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setScanStep('idle');
    setSelectedFile(null);
    setFilePreview(null);
    if (onCancel) onCancel();
  };

  const handleRetry = () => {
    if (selectedFile) {
      startDocumentScan(selectedFile);
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Main Drag-Drop Box */}
      {scanStep === 'idle' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative group cursor-pointer border-2 border-dashed rounded-2xl transition-all duration-200 text-center ${
            compact ? 'p-4' : 'p-6 sm:p-8'
          } ${
            isDragging
              ? 'border-teal-500 bg-teal-500/10 scale-[0.99]'
              : 'border-[var(--border-subtle)] hover:border-teal-500/80 bg-[var(--surface-sunken)] hover:bg-teal-500/5'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500/20 via-cyan-500/20 to-purple-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 group-hover:scale-105 transition-transform shadow-inner">
                <Sparkles className="w-6 h-6 animate-pulse text-teal-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-teal-500 text-white rounded-full shadow-md">
                <Upload className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-semibold text-[var(--fg-primary)] flex items-center justify-center gap-1.5">
                <span>Scan Bill, Invoice or Receipt</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  AI OCR
                </span>
              </div>
              <p className="text-xs text-[var(--fg-muted)] max-w-sm mx-auto">
                Drag & drop your document here, or{' '}
                <span className="text-teal-400 font-semibold underline underline-offset-2">browse file</span>
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)] pt-1">
              <span className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)] font-medium">
                PDF
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)] font-medium">
                JPG
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)] font-medium">
                PNG
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)] font-medium">
                WEBP
              </span>
              <span>• Max {MAX_SIZE_MB}MB</span>
            </div>
          </div>
        </div>
      )}

      {/* Uploading / Processing State */}
      {(scanStep === 'uploading' || scanStep === 'processing') && (
        <div className="p-6 rounded-2xl border border-teal-500/30 bg-gradient-to-b from-teal-500/10 via-transparent to-transparent text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-bold text-[var(--fg-primary)]">{scanStatusMessage}</div>
            <div className="text-xs text-[var(--fg-muted)]">
              {selectedFile?.name} ({(selectedFile ? selectedFile.size / (1024 * 1024) : 0).toFixed(2)} MB)
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[var(--surface-sunken)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)] max-w-md mx-auto">
            <div
              className="bg-gradient-to-r from-teal-500 to-cyan-400 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex justify-center pt-2">
            <Button size="sm" variant="outline" onClick={handleCancelScan} className="text-xs">
              <X className="w-3.5 h-3.5 mr-1" /> Cancel Scanning
            </Button>
          </div>
        </div>
      )}

      {/* Done State Summary */}
      {scanStep === 'done' && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--fg-primary)] flex items-center gap-1.5">
                <span>{selectedFile?.name || 'Document Scanned'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Extracted
                </span>
              </div>
              <div className="text-[11px] text-[var(--fg-muted)]">
                Review the automatically populated transaction fields below before saving.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {filePreview && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => setShowPreviewModal(true)}
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Scan Another
            </Button>
          </div>
        </div>
      )}

      {/* Duplicate Warning Banner */}
      {duplicateAlert && duplicateAlert.isDuplicate && (
        <div className="mt-3 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>Potential Duplicate Document Detected</span>
            </div>
            <p className="text-amber-200/90 leading-relaxed">
              {duplicateAlert.reason}
            </p>
            {duplicateAlert.details && (
              <div className="text-[11px] text-amber-300/80 pt-1">
                Matched Record ID: <span className="font-mono">{duplicateAlert.matchedId}</span> (
                {duplicateAlert.details.title || duplicateAlert.details.invoiceNumber || 'Financial Record'})
              </div>
            )}
            <p className="text-[11px] text-amber-400/80 italic pt-0.5">
              Please double check before saving to prevent duplicate accounting entries.
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {scanStep === 'error' && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-rose-300">Extraction Error</div>
              <div className="text-[11px] text-[var(--fg-muted)] line-clamp-2">
                {errorDetails || 'Failed to process document'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleRetry} className="text-xs gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelScan} className="text-xs">
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {showPreviewModal && filePreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
              <div className="text-xs font-semibold text-[var(--fg-primary)] flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-teal-400" />
                <span>Original Document Preview ({selectedFile?.name})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-black/40">
              <img
                src={filePreview}
                alt="Document Preview"
                className="max-h-[70vh] object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
