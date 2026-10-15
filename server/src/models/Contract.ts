import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IContract extends Document {
  name: string;
  vendor?: Types.ObjectId;
  client?: Types.ObjectId;
  type: string;
  amount: number;
  billingCycle: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  startDate: Date;
  renewalDate?: Date;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  documents: { name: string; url: string }[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contractSchema = new Schema<IContract>(
  {
    name: { type: String, required: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    type: { type: String, default: 'subscription' },
    amount: { type: Number, default: 0 },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'one_time'],
      default: 'monthly',
    },
    startDate: { type: Date, required: true },
    renewalDate: { type: Date, index: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
      default: 'active',
      index: true,
    },
    documents: [{ name: String, url: String }],
    notes: String,
  },
  { timestamps: true }
);

export const Contract = mongoose.model<IContract>('Contract', contractSchema);
