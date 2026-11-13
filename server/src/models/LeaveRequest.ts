import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export interface ILeaveRequest extends Document {
  user: Types.ObjectId;
  type: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: LEAVE_TYPES, required: true, default: 'casual' },
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true, index: true },
    days: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: 'pending',
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ status: 1, createdAt: -1 });
leaveRequestSchema.index({ user: 1, status: 1, startDate: -1 });

export const LeaveRequest = mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);
