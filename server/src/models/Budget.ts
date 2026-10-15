import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IBudget extends Document {
  name: string;
  category?: string;
  project?: Types.ObjectId;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  planned: number;
  actual: number;
  status: 'draft' | 'pending' | 'locked' | 'rejected';
  approval?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const budgetSchema = new Schema<IBudget>(
  {
    name: { type: String, required: true },
    category: String,
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    period: { type: String, required: true },
    periodStart: Date,
    periodEnd: Date,
    planned: { type: Number, default: 0 },
    actual: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'pending', 'locked', 'rejected'],
      default: 'draft',
    },
    approval: { type: Schema.Types.ObjectId, ref: 'Approval' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Budget = mongoose.model<IBudget>('Budget', budgetSchema);
