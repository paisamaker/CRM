import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IBillPayment {
  _id?: Types.ObjectId;
  amount: number;
  date: Date;
  method?: string;
  note?: string;
  transaction?: Types.ObjectId;
  receiptUrl?: string;
  recordedBy: Types.ObjectId;
}

export interface IBill extends Document {
  title: string;
  billNumber: string;
  type: 'payable' | 'receivable';
  partyName: string;
  client?: Types.ObjectId;
  vendor?: Types.ObjectId;
  category: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  billDate: Date;
  dueDate: Date;
  description?: string;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'cancelled';
  paymentMethod?: string;
  notes?: string;
  attachment?: {
    name: string;
    url: string;
    mime?: string;
    size?: number;
  };
  payments: IBillPayment[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const billSchema = new Schema<IBill>(
  {
    title: { type: String, required: true, trim: true },
    billNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['payable', 'receivable'], required: true, index: true },
    partyName: { type: String, required: true, trim: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', index: true },
    category: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    outstandingAmount: { type: Number, required: true, min: 0 },
    billDate: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true, index: true },
    description: { type: String, trim: true },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'cancelled'],
      default: 'unpaid',
      index: true,
    },
    paymentMethod: String,
    notes: String,
    attachment: {
      name: String,
      url: String,
      mime: String,
      size: Number,
    },
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, default: Date.now },
        method: String,
        note: String,
        transaction: { type: Schema.Types.ObjectId, ref: 'Transaction' },
        receiptUrl: String,
        recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

billSchema.index({ type: 1, paymentStatus: 1, dueDate: 1 });
billSchema.index({ billDate: -1 });

export const Bill = mongoose.model<IBill>('Bill', billSchema);
