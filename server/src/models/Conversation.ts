import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IConversation extends Document {
  type: 'direct' | 'group';
  name?: string;
  members: Types.ObjectId[];
  createdBy: Types.ObjectId;
  project?: Types.ObjectId;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ['direct', 'group'], required: true, index: true },
    name: String,
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    lastMessageAt: Date,
    lastMessagePreview: String,
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, type: 1 });
conversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
