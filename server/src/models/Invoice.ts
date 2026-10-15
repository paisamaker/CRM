import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IInvoicePayment {
  amount: number;
  date: Date;
  method?: string;
  note?: string;
}

export interface IInvoice extends Document {
  number: string;
  client: Types.ObjectId;
  project?: Types.ObjectId;
  items: { description: string; quantity: number; unitPrice: number; amount: number }[];
  tax: number;
  discount: number;
  subtotal: number;
  total: number;
  paid: number;
  status: 'draft' | 'pending_approval' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'rejected';
  approval?: Types.ObjectId;
  issueDate: Date;
  dueDate: Date;
  payments: IInvoicePayment[];
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    number: { type: String, required: true, unique: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    items: [
      {
        description: String,
        quantity: { type: Number, default: 1 },
        unitPrice: Number,
        amount: Number,
      },
    ],
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'rejected'],
      default: 'draft',
      index: true,
    },
    approval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true, index: true },
    payments: [
      {
        amount: Number,
        date: Date,
        method: String,
        note: String,
      },
    ],
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ client: 1, status: 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ createdAt: -1 });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
