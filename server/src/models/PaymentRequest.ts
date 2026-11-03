import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const PAYMENT_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'awaiting_final_approval',
  'paid',
  'disputed',
] as const;

export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const DEFAULT_PAYMENT_REQUEST_CATEGORIES = [
  'Office Expense',
  'Vendor Payment',
  'Salary',
  'USDT Payment',
  'Other',
] as const;

export interface IPaymentRequestHistory {
  action: string;
  by: Types.ObjectId;
  at: Date;
  note?: string;
}

export interface IPaymentRequestOcr {
  payeeName?: string | null;
  upiId?: string | null;
  accountLast4?: string | null;
  amount?: number | null;
  transactionId?: string | null;
  rawTextSnippet?: string | null;
  confidence?: 'high' | 'medium' | 'low' | 'unclear';
  matched?: {
    payeeName?: boolean;
    paymentDetails?: boolean;
    amount?: boolean;
    transactionIdUnique?: boolean;
  };
  mismatches?: string[];
  scannedAt?: Date;
}

export interface IPaymentRequest extends Document {
  requestNumber: number;
  payeeName: string;
  paymentDetails: {
    upiId?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankName?: string;
    accountHolderName?: string;
    qrCode?: { name: string; url: string; mime?: string; size?: number };
    notes?: string;
  };
  amount: number;
  currency: string;
  description: string;
  category: string;
  status: PaymentRequestStatus;
  /** True when OCR could not find a UTR / transaction id */
  noTransactionId: boolean;
  flags: {
    noTransactionId: boolean;
    amountMismatch: boolean;
    ocrUnclear: boolean;
    needsManualReview: boolean;
  };
  screenshot?: { name: string; url: string; mime?: string; size?: number; hash?: string };
  ocr?: IPaymentRequestOcr;
  transactionId?: string;
  transaction?: Types.ObjectId;
  amountApproval?: Types.ObjectId;
  proofApproval?: Types.ObjectId;
  approvedAmount?: number;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  screenshotUploadedBy?: Types.ObjectId;
  screenshotUploadedAt?: Date;
  finalApprovedBy?: Types.ObjectId;
  finalApprovedAt?: Date;
  disputedBy?: Types.ObjectId;
  disputedAt?: Date;
  disputeReason?: string;
  createdBy: Types.ObjectId;
  history: IPaymentRequestHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const paymentRequestSchema = new Schema<IPaymentRequest>(
  {
    requestNumber: { type: Number, required: true, unique: true, index: true },
    payeeName: { type: String, required: true, trim: true },
    paymentDetails: {
      upiId: { type: String, trim: true },
      bankAccountNumber: { type: String, trim: true },
      bankIfsc: { type: String, trim: true, uppercase: true },
      bankName: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      qrCode: {
        name: String,
        url: String,
        mime: String,
        size: Number,
      },
      notes: String,
    },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: PAYMENT_REQUEST_STATUSES,
      default: 'pending',
      index: true,
    },
    noTransactionId: { type: Boolean, default: false, index: true },
    flags: {
      noTransactionId: { type: Boolean, default: false },
      amountMismatch: { type: Boolean, default: false },
      ocrUnclear: { type: Boolean, default: false },
      needsManualReview: { type: Boolean, default: false },
    },
    screenshot: {
      name: String,
      url: String,
      mime: String,
      size: Number,
      hash: String,
    },
    ocr: {
      payeeName: String,
      upiId: String,
      accountLast4: String,
      amount: Number,
      transactionId: String,
      rawTextSnippet: String,
      confidence: { type: String, enum: ['high', 'medium', 'low', 'unclear'] },
      matched: {
        payeeName: Boolean,
        paymentDetails: Boolean,
        amount: Boolean,
        transactionIdUnique: Boolean,
      },
      mismatches: [String],
      scannedAt: Date,
    },
    transactionId: { type: String, trim: true, index: true, sparse: true },
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', index: true },
    amountApproval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    proofApproval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    approvedAmount: Number,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectionReason: String,
    screenshotUploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    screenshotUploadedAt: Date,
    finalApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    finalApprovedAt: Date,
    disputedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    disputedAt: Date,
    disputeReason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    history: [
      {
        action: { type: String, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

paymentRequestSchema.index({ status: 1, createdAt: -1 });
paymentRequestSchema.index({ createdBy: 1, status: 1 });
paymentRequestSchema.index({ 'flags.noTransactionId': 1, status: 1 });

export const PaymentRequest = mongoose.model<IPaymentRequest>('PaymentRequest', paymentRequestSchema);

export async function nextPaymentRequestNumber(): Promise<number> {
  const last = await PaymentRequest.findOne().sort({ requestNumber: -1 }).select('requestNumber').lean();
  return (last?.requestNumber || 100) + 1;
}
