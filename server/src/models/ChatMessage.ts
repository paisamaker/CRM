import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IChatMessage extends Document {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  clientId?: string; // idempotency / duplicate prevention
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    clientId: { type: String, index: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });
chatMessageSchema.index({ conversation: 1, clientId: 1 }, { unique: true, sparse: true });

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
