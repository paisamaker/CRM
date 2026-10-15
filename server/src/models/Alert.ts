import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IAlert extends Document {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  link?: string;
  user?: Types.ObjectId;
  status: 'open' | 'snoozed' | 'resolved';
  snoozedUntil?: Date;
  dedupeKey: string;
  meta?: unknown;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlert>(
  {
    type: { type: String, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    message: { type: String, required: true },
    link: String,
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    status: { type: String, enum: ['open', 'snoozed', 'resolved'], default: 'open', index: true },
    snoozedUntil: Date,
    dedupeKey: { type: String, required: true, index: true },
    meta: Schema.Types.Mixed,
    resolvedAt: Date,
  },
  { timestamps: true }
);

alertSchema.index({ dedupeKey: 1, status: 1 });

export const Alert = mongoose.model<IAlert>('Alert', alertSchema);
