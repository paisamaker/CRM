import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ITransaction extends Document {
  type: 'revenue' | 'expense';
  category: string;
  amount: number;
  taxAmount?: number;
  title?: string;
  description?: string;
  currency: string;
  date: Date;
  client?: Types.ObjectId;
  vendor?: Types.ObjectId;
  employee?: Types.ObjectId;
  project?: Types.ObjectId;
  invoice?: Types.ObjectId;
  bill?: Types.ObjectId;
  payroll?: Types.ObjectId;
  bankAccount?: Types.ObjectId;
  invoiceNumber?: string;
  documentHash?: string;
  scannedDocument?: Types.ObjectId;
  documentMetadata?: Record<string, unknown>;
  receipt?: { name: string; url: string };
  attachment?: { name: string; url: string; mime?: string; size?: number; hash?: string };
  paymentMethod?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  approval?: Types.ObjectId;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    type: { type: String, enum: ['revenue', 'expense'], required: true, index: true },
    category: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    currency: { type: String, default: 'INR' },
    date: { type: Date, required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', index: true },
    employee: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    bill: { type: Schema.Types.ObjectId, ref: 'Bill', index: true },
    payroll: { type: Schema.Types.ObjectId, ref: 'Payroll', index: true },
    bankAccount: { type: Schema.Types.ObjectId, ref: 'BankAccount', index: true },
    invoiceNumber: { type: String, trim: true, index: true },
    documentHash: { type: String, index: true },
    scannedDocument: { type: Schema.Types.ObjectId, ref: 'ScannedDocument', index: true },
    documentMetadata: { type: Schema.Types.Mixed },
    receipt: { name: String, url: String },
    attachment: {
      name: String,
      url: String,
      mime: String,
      size: Number,
      hash: String,
    },
    paymentMethod: String,
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled'],
      default: 'paid',
      index: true,
    },
    approval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ type: 1, status: 1, date: 1 });
transactionSchema.index({ status: 1, date: -1 });
transactionSchema.index({ client: 1, date: -1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);

export const EXPENSE_CATEGORIES = [
  'Software Purchase',
  'Domain',
  'Ads Running',
  'Custom Bill',
  'Software Subscriptions',
  'Domain Services',
  'Marketing',
  'Operations',
  'Employee Stipends',
  'Vendor Costs',
  'Other',
] as const;

/** Presets managers use when creating expense bills for CEO approval */
export const MANAGER_EXPENSE_BILL_TYPES = [
  'Software Purchase',
  'Domain',
  'Ads Running',
  'Custom Bill',
] as const;

export const REVENUE_CATEGORIES = [
  'Client Payout',
  'Host Fee',
  'Agency Fee',
  'Subscription Renewal',
  'Other',
] as const;
