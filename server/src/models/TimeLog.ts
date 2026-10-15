import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ITimeLog extends Document {
  user: Types.ObjectId;
  task: Types.ObjectId;
  start: Date;
  end?: Date;
  minutes: number;
  note?: string;
  submitted: boolean;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const timeLogSchema = new Schema<ITimeLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    start: { type: Date, required: true },
    end: Date,
    minutes: { type: Number, default: 0 },
    note: String,
    submitted: { type: Boolean, default: false },
    submittedAt: Date,
  },
  { timestamps: true }
);

timeLogSchema.index({ user: 1, start: -1 });

export const TimeLog = mongoose.model<ITimeLog>('TimeLog', timeLogSchema);
