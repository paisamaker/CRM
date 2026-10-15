import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IClient extends Document {
  name: string;
  company: string;
  contact?: string;
  email?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'churned' | 'prospect';
  industry?: string;
  owner: Types.ObjectId;
  onboardedAt?: Date;
  tags: string[];
  notes?: string;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const clientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    contact: String,
    email: { type: String, lowercase: true },
    phone: String,
    status: {
      type: String,
      enum: ['active', 'inactive', 'churned', 'prospect'],
      default: 'active',
      index: true,
    },
    industry: String,
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    onboardedAt: Date,
    tags: [String],
    notes: String,
    lastActivityAt: Date,
  },
  { timestamps: true }
);

clientSchema.index({ name: 'text', company: 'text', email: 'text' });
clientSchema.index({ status: 1, createdAt: -1 });
clientSchema.index({ owner: 1, status: 1 });
clientSchema.index({ createdAt: -1 });

export const Client = mongoose.model<IClient>('Client', clientSchema);
