import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const LEAD_STAGES = [
  'lead',
  'contacted',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

export interface ILead extends Document {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  source: string;
  stage: (typeof LEAD_STAGES)[number];
  value: number;
  owner: Types.ObjectId;
  nextFollowUp?: Date;
  lostReason?: string;
  convertedClient?: Types.ObjectId;
  notes?: string;
  lastActivityAt?: Date;
  activity: {
    type: string;
    message: string;
    by?: Types.ObjectId;
    at: Date;
    meta?: unknown;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    company: String,
    email: String,
    phone: String,
    source: { type: String, default: 'inbound' },
    stage: { type: String, enum: LEAD_STAGES, default: 'lead', index: true },
    value: { type: Number, default: 0 },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nextFollowUp: Date,
    lostReason: String,
    convertedClient: { type: Schema.Types.ObjectId, ref: 'Client' },
    notes: String,
    lastActivityAt: Date,
    activity: [
      {
        type: { type: String },
        message: { type: String },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        meta: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

leadSchema.index({ stage: 1, createdAt: -1 });
leadSchema.index({ owner: 1, stage: 1 });
leadSchema.index({ createdAt: -1 });

export const Lead = mongoose.model<ILead>('Lead', leadSchema);
