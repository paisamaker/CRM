import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IExtractedFinancialData {
  documentType: 'invoice' | 'tax_invoice' | 'bill' | 'receipt' | 'credit_note' | 'debit_note' | 'salary_slip' | 'other';
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  billNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  currency: string;
  partyDetails: {
    vendorName?: string | null;
    vendorAddress?: string | null;
    vendorGstin?: string | null;
    customerName?: string | null;
    customerGstin?: string | null;
  };
  financialDetails: {
    subtotal?: number | null;
    discount?: number | null;
    taxableAmount?: number | null;
    cgst?: number | null;
    sgst?: number | null;
    igst?: number | null;
    otherTaxes?: number | null;
    totalTax?: number | null;
    grandTotal?: number | null;
    amountPaid?: number | null;
    outstandingAmount?: number | null;
  };
  transactionDetails: {
    suggestedType: 'expense' | 'revenue';
    suggestedCategory: string;
    paymentMethod?: string | null;
    paymentStatus: 'paid' | 'unpaid' | 'partially_paid';
    description?: string;
    notes?: string;
  };
  lineItems?: Array<{
    name: string;
    quantity?: number;
    unitPrice?: number;
    taxRate?: number;
    lineTotal?: number;
  }>;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
  uncertainFields: string[];
}

export interface IScannedDocument extends Document {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  documentHash: string; // SHA-256 for duplicate detection
  documentType: string;
  extractedData: IExtractedFinancialData;
  rawText?: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'tesseract' | 'pdf-parse' | 'heuristic';
  status: 'scanned' | 'confirmed' | 'discarded';
  linkedTransaction?: Types.ObjectId;
  linkedBill?: Types.ObjectId;
  scannedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const scannedDocumentSchema = new Schema<IScannedDocument>(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    documentHash: { type: String, required: true },
    documentType: { type: String, default: 'bill', index: true },
    extractedData: { type: Schema.Types.Mixed, required: true },
    rawText: { type: String, select: false }, // exclude by default for performance
    provider: {
      type: String,
      enum: ['gemini', 'openai', 'anthropic', 'tesseract', 'pdf-parse', 'heuristic'],
      default: 'heuristic',
    },
    status: {
      type: String,
      enum: ['scanned', 'confirmed', 'discarded'],
      default: 'scanned',
      index: true,
    },
    linkedTransaction: { type: Schema.Types.ObjectId, ref: 'Transaction', index: true },
    linkedBill: { type: Schema.Types.ObjectId, ref: 'Bill', index: true },
    scannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

scannedDocumentSchema.index({ documentHash: 1, createdAt: -1 });
scannedDocumentSchema.index({ 'extractedData.invoiceNumber': 1 });
scannedDocumentSchema.index({ 'extractedData.partyDetails.vendorName': 1 });

export const ScannedDocument = mongoose.model<IScannedDocument>('ScannedDocument', scannedDocumentSchema);
