import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type ChatMessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'system';

export interface IChatAttachment {
  name: string;
  url: string;
  size?: number;
  mime?: string;
  publicId?: string;
  uploadedBy?: Types.ObjectId;
}

export interface IChatReaction {
  emoji: string;
  users: Types.ObjectId[];
}

export interface IChatMessage extends Document {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  type: ChatMessageType;
  clientId?: string;
  attachments: IChatAttachment[];
  replyTo?: Types.ObjectId;
  forwardedFrom?: Types.ObjectId;
  reactions: IChatReaction[];
  readBy: Types.ObjectId[];
  deliveredTo: Types.ObjectId[];
  deletedFor: Types.ObjectId[];
  deletedForEveryoneAt?: Date;
  deletedBy?: Types.ObjectId;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IChatAttachment>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: Number,
    mime: String,
    publicId: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const reactionSchema = new Schema<IChatReaction>(
  {
    emoji: { type: String, required: true },
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

const chatMessageSchema = new Schema<IChatMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'audio', 'video', 'system'],
      default: 'text',
      index: true,
    },
    clientId: { type: String, index: true },
    attachments: { type: [attachmentSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: 'ChatMessage' },
    forwardedFrom: { type: Schema.Types.ObjectId, ref: 'ChatMessage' },
    reactions: { type: [reactionSchema], default: [] },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    deletedForEveryoneAt: Date,
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    editedAt: Date,
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, createdAt: -1 });
// Partial unique index: only enforce uniqueness when clientId is a real string
// (avoids sparse-compound null collisions across system messages).
chatMessageSchema.index(
  { conversation: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);
chatMessageSchema.index({ conversation: 1, deletedFor: 1, createdAt: -1 });
chatMessageSchema.index({ body: 'text' });

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
