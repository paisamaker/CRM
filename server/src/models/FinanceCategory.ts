import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IFinanceCategory extends Document {
  name: string;
  type: 'income' | 'expense';
  isDefault: boolean;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const financeCategorySchema = new Schema<IFinanceCategory>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['income', 'expense'], required: true, index: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

financeCategorySchema.index({ type: 1, name: 1 }, { unique: true });

export const FinanceCategory = mongoose.model<IFinanceCategory>(
  'FinanceCategory',
  financeCategorySchema
);

export const DEFAULT_INCOME_CATEGORIES = [
  'Client Payment',
  'Project Revenue',
  'Sales Revenue',
  'Service Revenue',
  'Other Income',
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Software Purchase',
  'Office Expenses',
  'Marketing',
  'Advertising',
  'Equipment Purchase',
  'Internet and Electricity',
  'Travel',
  'Vendor Payment',
  'Other Expenses',
] as const;
