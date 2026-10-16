import mongoose, { Schema, type Document } from 'mongoose';

export interface IBankAccount extends Document {
  name: string;
  bank: string;
  accountLast4: string;
  openingBalance: number;
  balance: number;
  currency: string;
  isPrimary: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    name: { type: String, required: true },
    bank: { type: String, required: true },
    accountLast4: { type: String, required: true },
    openingBalance: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    isPrimary: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

export const BankAccount = mongoose.model<IBankAccount>('BankAccount', bankAccountSchema);
