export type Colleague = {
  _id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  designation?: string;
  avatar?: string;
};

export type ConversationMember = {
  _id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
};

export type ChatAttachment = {
  name: string;
  url: string;
  size?: number;
  mime?: string;
  publicId?: string;
};

export type ChatReaction = {
  emoji: string;
  users: string[];
};

export type Conversation = {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatarUrl?: string;
  members: ConversationMember[];
  admins?: string[] | ConversationMember[];
  createdBy?: string;
  project?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastMessageSender?: { _id: string; name: string } | string;
  updatedAt?: string;
  createdAt?: string;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  draft?: string;
};

export type Message = {
  _id: string;
  conversation?: string;
  body: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'video' | 'system';
  createdAt: string;
  editedAt?: string;
  sender: {
    _id: string;
    name: string;
    email?: string;
    avatar?: string;
    role?: string;
  };
  clientId?: string;
  attachments?: ChatAttachment[];
  replyTo?: {
    _id: string;
    body?: string;
    type?: string;
    sender?: { _id?: string; name?: string };
    deletedForEveryoneAt?: string;
    attachments?: ChatAttachment[];
  } | string;
  reactions?: ChatReaction[];
  readBy?: string[];
  deliveredTo?: string[];
  deletedForEveryone?: boolean;
  tombstone?: string;
  status?: 'pending' | 'sent' | 'failed';
  forwardedFrom?: string;
};

export type ConversationFilter = 'all' | 'unread' | 'groups' | 'direct' | 'archived';

export type PendingAttachment = ChatAttachment & {
  previewUrl?: string;
  progress?: number;
};
