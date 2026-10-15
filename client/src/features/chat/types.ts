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

export type Conversation = {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  members: ConversationMember[];
  createdBy?: string;
  project?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  createdAt?: string;
  unread?: number;
};

export type Message = {
  _id: string;
  conversation?: string;
  body: string;
  createdAt: string;
  sender: {
    _id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  clientId?: string;
  readBy?: string[];
};

export type ConversationFilter = 'all' | 'unread' | 'groups' | 'direct';
