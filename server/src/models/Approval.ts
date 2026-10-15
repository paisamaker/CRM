import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const APPROVAL_TYPES = [
  'expense',
  'reimbursement',
  'procurement',
  'vendor_payment',
  'payroll',
  'bonus',
  'budget_allocation',
  'client_bill',
] as const;

export interface IApproval extends Document {
  type: (typeof APPROVAL_TYPES)[number];
  refModel: string;
  refId: Types.ObjectId;
  amount: number;
  currency: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requestedBy: Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  reason?: string;
  history: {
    action: string;
    by: Types.ObjectId;
    at: Date;
    note?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const approvalSchema = new Schema<IApproval>(
  {
    type: { type: String, enum: APPROVAL_TYPES, required: true, index: true },
    refModel: { type: String, required: true },
    refId: { type: Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    title: { type: String, required: true },
    description: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'changes_requested'],
      default: 'pending',
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    reason: String,
    history: [
      {
        action: String,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

approvalSchema.index({ status: 1, amount: -1, createdAt: -1 });
approvalSchema.index({ status: 1, priority: -1, amount: -1 });
approvalSchema.index({ requestedBy: 1, status: 1 });

export const Approval = mongoose.model<IApproval>('Approval', approvalSchema);
