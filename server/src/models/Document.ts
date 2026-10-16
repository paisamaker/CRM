import mongoose, { Schema, type Document as Doc, type Types } from 'mongoose';

export interface IDocument extends Doc {
  name: string;
  url: string;
  mime: string;
  size: number;
  folder: string;
  uploadedBy: Types.ObjectId;
  visibility: 'company' | 'private';
  project?: Types.ObjectId;
  linkedModel?: string;
  linkedId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    mime: String,
    size: Number,
    folder: { type: String, default: 'general', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    visibility: { type: String, enum: ['company', 'private'], default: 'company' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    linkedModel: { type: String, enum: ['Project', 'Task', 'Client', 'Invoice', 'Lead', 'User', 'Team'] },
    linkedId: { type: Schema.Types.ObjectId, refPath: 'linkedModel' },
  },
  { timestamps: true }
);

export const DocumentFile = mongoose.model<IDocument>('Document', documentSchema);
