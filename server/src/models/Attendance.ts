import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IAttendanceWorkLog {
  notes?: string;
  customTasks: string[];
  selectedTasks: {
    task: Types.ObjectId;
    title: string;
  }[];
  submittedAt?: Date;
}

export interface IAttendance extends Document {
  user: Types.ObjectId;
  date: string; // YYYY-MM-DD in company timezone
  checkInAt?: Date;
  checkOutAt?: Date;
  durationMinutes: number;
  status: 'checked_in' | 'checked_out' | 'missing_checkout' | 'corrected' | 'on_leave' | 'holiday';
  source: 'manual' | 'system' | 'correction';
  notes?: string;
  workLog?: IAttendanceWorkLog;
  corrections: {
    by: Types.ObjectId;
    at: Date;
    reason: string;
    before?: unknown;
    after?: unknown;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    checkInAt: Date,
    checkOutAt: Date,
    durationMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['checked_in', 'checked_out', 'missing_checkout', 'corrected', 'on_leave', 'holiday'],
      default: 'checked_in',
      index: true,
    },
    source: { type: String, enum: ['manual', 'system', 'correction'], default: 'manual' },
    notes: String,
    workLog: {
      notes: String,
      customTasks: { type: [String], default: [] },
      selectedTasks: [
        {
          task: { type: Schema.Types.ObjectId, ref: 'Task' },
          title: { type: String, required: true },
        },
      ],
      submittedAt: Date,
    },
    corrections: [
      {
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        reason: String,
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ user: 1, date: -1 });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ status: 1, date: -1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
