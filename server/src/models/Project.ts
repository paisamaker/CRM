import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IProjectAttachment {
  _id?: Types.ObjectId;
  name: string;
  url: string;
  size?: number;
  mime?: string;
  uploadedBy?: Types.ObjectId;
  createdAt?: Date;
}

export interface IProject extends Document {
  name: string;
  client?: Types.ObjectId;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
  budget: number;
  startDate?: Date;
  endDate?: Date;
  status: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  progress: number;
  tags: string[];
  description?: string;
  attachments: IProjectAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    budget: { type: Number, default: 0 },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['planned', 'active', 'on_hold', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    tags: [String],
    description: String,
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: Number,
        mime: String,
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

projectSchema.index({ status: 1, endDate: 1 });
projectSchema.index({ owner: 1, status: 1 });
projectSchema.index({ members: 1, status: 1 });
projectSchema.index({ client: 1, status: 1 });
projectSchema.index({ createdAt: -1 });

export const Project = mongoose.model<IProject>('Project', projectSchema);
