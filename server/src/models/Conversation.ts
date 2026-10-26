import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IMemberPref {
  user: Types.ObjectId;
  pinnedAt?: Date;
  archivedAt?: Date;
  mutedUntil?: Date;
  hiddenAt?: Date;
  lastReadAt?: Date;
  draft?: string;
}

export interface IConversation extends Document {
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatarUrl?: string;
  members: Types.ObjectId[];
  admins: Types.ObjectId[];
  createdBy: Types.ObjectId;
  project?: Types.ObjectId;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageSender?: Types.ObjectId;
  memberPrefs: IMemberPref[];
  createdAt: Date;
  updatedAt: Date;
}

const memberPrefSchema = new Schema<IMemberPref>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pinnedAt: Date,
    archivedAt: Date,
    mutedUntil: Date,
    hiddenAt: Date,
    lastReadAt: Date,
    draft: { type: String, maxlength: 4000 },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ['direct', 'group'], required: true, index: true },
    name: String,
    description: { type: String, maxlength: 500 },
    avatarUrl: String,
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    lastMessageAt: Date,
    lastMessagePreview: String,
    lastMessageSender: { type: Schema.Types.ObjectId, ref: 'User' },
    memberPrefs: { type: [memberPrefSchema], default: [] },
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, type: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ 'memberPrefs.user': 1, 'memberPrefs.pinnedAt': -1 });

export function getOrCreatePref(conversation: IConversation, userId: string): IMemberPref {
  let pref = conversation.memberPrefs.find((p) => String(p.user) === userId);
  if (!pref) {
    pref = { user: new mongoose.Types.ObjectId(userId) } as IMemberPref;
    conversation.memberPrefs.push(pref);
  }
  return pref;
}

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
