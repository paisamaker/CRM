import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IPayroll extends Document {
  employee: Types.ObjectId;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  base: number;
  stipend: number;
  incentive: number;
  deductions: number;
  net: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'disbursed' | 'rejected';
  paidOn?: Date;
  paymentMethod?: string;
  transactionRef?: string;
  transaction?: Types.ObjectId;
  slipUrl?: string;
  approval?: Types.ObjectId;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const payrollSchema = new Schema<IPayroll>(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    period: { type: String, required: true },
    periodStart: Date,
    periodEnd: Date,
    base: { type: Number, default: 0 },
    stipend: { type: Number, default: 0 },
    incentive: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    net: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'disbursed', 'rejected'],
      default: 'draft',
      index: true,
    },
    paidOn: Date,
    paymentMethod: String,
    transactionRef: String,
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    slipUrl: String,
    approval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

payrollSchema.index({ period: 1, employee: 1 }, { unique: true });
payrollSchema.index({ period: 1, status: 1 });
payrollSchema.index({ employee: 1, period: -1 });

export const Payroll = mongoose.model<IPayroll>('Payroll', payrollSchema);
