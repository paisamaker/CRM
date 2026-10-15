import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ITransaction extends Document {
  type: 'revenue' | 'expense';
  category: string;
  amount: number;
  currency: string;
  date: Date;
  client?: Types.ObjectId;
  vendor?: Types.ObjectId;
  project?: Types.ObjectId;
  invoice?: Types.ObjectId;
  receipt?: { name: string; url: string };
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
    currency: { type: String, default: 'INR' },
    date: { type: Date, required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    receipt: { name: String, url: String },
    paymentMethod: String,
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled'],
      default: 'pending',
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
