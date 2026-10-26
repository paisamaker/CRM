import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Conversation, getOrCreatePref } from '../../models/Conversation.js';
import { ChatMessage } from '../../models/ChatMessage.js';
import { User } from '../../models/User.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { getIO } from '../../config/socket.js';
import { env } from '../../config/env.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { assertSafeUploadSignature } from '../../utils/fileSignature.js';
import { uploadDocumentToCloudinary } from '../../utils/cloudinary.js';

const router = Router();
router.use(authenticate);

const DELETE_FOR_EVERYONE_MS = 60 * 60 * 1000; // 1 hour
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chatUploadRoot = path.resolve(__dirname, '../../../uploads/chat');
if (!fs.existsSync(chatUploadRoot)) fs.mkdirSync(chatUploadRoot, { recursive: true });

const CHAT_ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'video/mp4',
  'video/webm',
  'audio/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
]);

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatUploadRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: Math.max(env.UPLOAD_MAX_MB, 25) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!CHAT_ALLOWED.has(file.mimetype)) {
      return cb(new AppError('File type not allowed for chat', 400, 'INVALID_FILE_TYPE') as unknown as Error);
    }
    cb(null, true);
  },
});

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function isMember(conversation: { members: mongoose.Types.ObjectId[] }, userId: string): boolean {
  return conversation.members.some((m) => String(m) === userId);
}

function isAdmin(conversation: { admins?: mongoose.Types.ObjectId[]; createdBy: mongoose.Types.ObjectId }, userId: string, role?: string) {
  if (role === 'ceo') return true;
  if (String(conversation.createdBy) === userId) return true;
  return (conversation.admins || []).some((a) => String(a) === userId);
}

async function requireMembership(conversationId: string, userId: string) {
  if (!mongoose.isValidObjectId(conversationId)) throw new NotFoundError('Conversation not found');
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');
  if (!isMember(conversation, userId)) throw new ForbiddenError('Not a member of this conversation');
  return conversation;
}

function serializeMessageForUser(msg: any, userId: string) {
  if (!msg) return msg;
  const deletedFor = (msg.deletedFor || []).map(String);
  if (deletedFor.includes(userId)) return null;
  if (msg.deletedForEveryoneAt) {
    return {
      ...msg,
      body: '',
      attachments: [],
      reactions: [],
      deletedForEveryone: true,
      tombstone: 'This message was deleted',
    };
  }
  return msg;
}

function previewFromMessage(body: string, attachments?: { mime?: string; name?: string }[]) {
  if (attachments?.length) {
    const a = attachments[0];
    if (a.mime?.startsWith('image/')) return '📷 Photo';
    if (a.mime?.startsWith('video/')) return '🎥 Video';
    if (a.mime?.startsWith('audio/')) return '🎤 Voice message';
    return `📎 ${a.name || 'File'}`;
  }
  return (body || '').slice(0, 120);
}

function emitToConversation(conversationId: string, event: string, payload: unknown) {
  try {
    getIO().to(`conversation:${conversationId}`).emit(event, payload);
  } catch {
    /* optional in tests */
  }
}

function emitToUsers(userIds: string[], event: string, payload: unknown) {
  try {
    const io = getIO();
    for (const id of userIds) io.to(`user:${id}`).emit(event, payload);
  } catch {
    /* optional */
  }
}

async function createSystemMessage(conversationId: string, body: string, senderId: string) {
  const message = await ChatMessage.create({
    conversation: conversationId,
    sender: senderId,
    body,
    type: 'system',
    readBy: [senderId],
  });
  return ChatMessage.findById(message._id).populate('sender', 'name email avatar role').lean();
}

/** Directory of active colleagues */
router.get(
  '/colleagues',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const filter: Record<string, unknown> = {
      status: 'active',
      _id: { $ne: req.user!.id },
    };
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { department: new RegExp(search, 'i') },
      ];
    }
    const users = await User.find(filter)
      .select('name email role department avatar designation')
      .sort({ name: 1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: users });
  })
);

/** Online presence snapshot */
router.get(
  '/presence',
  authorize('chat', 'read'),
  asyncHandler(async (_req, res) => {
    const { getOnlineUserIds } = await import('../../config/socket.js');
    res.json({ success: true, data: { onlineIds: getOnlineUserIds() } });
  })
);

router.get(
  '/conversations',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const filter = String(req.query.filter || 'all');
    const search = String(req.query.search || '').trim().toLowerCase();

    const conversations = await Conversation.find({ members: userId })
      .populate('members', 'name email avatar role')
      .populate('lastMessageSender', 'name')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(150)
      .lean();

    const visible = conversations.filter((c) => {
      const pref = (c.memberPrefs || []).find((p: any) => String(p.user) === userId);
      if (pref?.hiddenAt) return false;
      if (filter === 'archived') return !!pref?.archivedAt;
      if (pref?.archivedAt && filter !== 'archived') return false;
      if (filter === 'unread') return true; // filter after unread calc
      if (filter === 'groups') return c.type === 'group';
      if (filter === 'direct') return c.type === 'direct';
      return true;
    });

    const withMeta = await Promise.all(
      visible.map(async (c) => {
        const pref = (c.memberPrefs || []).find((p: any) => String(p.user) === userId);
        const unread = await ChatMessage.countDocuments({
          conversation: c._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
          deletedFor: { $ne: userId },
          deletedForEveryoneAt: { $exists: false },
        });
        return {
          ...c,
          unread,
          pinned: !!pref?.pinnedAt,
          muted: !!(pref?.mutedUntil && new Date(pref.mutedUntil) > new Date()),
          archived: !!pref?.archivedAt,
          draft: pref?.draft || '',
          myPref: pref || null,
        };
      })
    );

    let result = withMeta;
    if (filter === 'unread') result = result.filter((c) => (c.unread || 0) > 0);
    if (search) {
      result = result.filter((c) => {
        const name =
          c.type === 'group'
            ? c.name || ''
            : (c.members as any[])?.find((m) => String(m._id) !== userId)?.name || '';
        return (
          name.toLowerCase().includes(search) ||
          (c.lastMessagePreview || '').toLowerCase().includes(search)
        );
      });
    }

    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });

    res.json({ success: true, data: result });
  })
);

router.post(
  '/conversations/direct',
  authorize('chat', 'create'),
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
    if (userId === req.user!.id) throw new AppError('Cannot chat with yourself', 400);
    if (!mongoose.isValidObjectId(userId)) throw new AppError('Invalid user', 400);

    const peer = await User.findOne({ _id: userId, status: 'active' }).lean();
    if (!peer) throw new NotFoundError('User not found');

    const members = [req.user!.id, userId].sort();
    let conversation = await Conversation.findOne({
      type: 'direct',
      members: { $all: members, $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        members,
        admins: [req.user!.id],
        createdBy: req.user!.id,
        memberPrefs: members.map((id) => ({ user: id })),
      });
    }

    // Un-hide for current user if previously hidden
    const pref = getOrCreatePref(conversation, req.user!.id);
    pref.hiddenAt = undefined;
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();

    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/conversations/group',
  authorize('chat', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).max(80),
        memberIds: z.array(z.string()).min(1).max(50),
        description: z.string().max(500).optional(),
        projectId: z.string().optional(),
      })
      .parse(req.body);

    const unique = [...new Set([req.user!.id, ...body.memberIds])];
    const validUsers = await User.find({ _id: { $in: unique }, status: 'active' }).select('_id');
    if (validUsers.length < 2) throw new AppError('At least two active members required', 400);

    const memberIds = validUsers.map((u) => u._id);
    const conversation = await Conversation.create({
      type: 'group',
      name: body.name,
      description: body.description,
      members: memberIds,
      admins: [req.user!.id],
      createdBy: req.user!.id,
      project: body.projectId,
      memberPrefs: memberIds.map((id) => ({ user: id })),
    });

    const sys = await createSystemMessage(
      String(conversation._id),
      `${req.user!.name || 'Someone'} created group "${body.name}"`,
      req.user!.id
    );
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = sys?.body?.slice(0, 120);
    conversation.lastMessageSender = req.user!.id as any;
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();

    emitToUsers(
      memberIds.map(String).filter((id) => id !== req.user!.id),
      'chat:notify',
      { conversationId: String(conversation._id), type: 'group_created' }
    );

    res.status(201).json({ success: true, data: populated });
  })
);

router.patch(
  '/conversations/:id',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(500).optional().nullable(),
        avatarUrl: z.string().url().optional().nullable(),
      })
      .parse(req.body);

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);
    if (conversation.type !== 'group') throw new AppError('Only groups can be updated this way', 400);
    if (!isAdmin(conversation, req.user!.id, req.user!.role)) {
      throw new ForbiddenError('Only group admins can update group details');
    }

    if (body.name) conversation.name = body.name;
    if (body.description !== undefined) conversation.description = body.description || undefined;
    if (body.avatarUrl !== undefined) conversation.avatarUrl = body.avatarUrl || undefined;
    await conversation.save();

    const sys = await createSystemMessage(
      String(conversation._id),
      `${req.user!.name || 'Admin'} updated group info`,
      req.user!.id
    );
    emitToConversation(String(conversation._id), 'chat:message', sys);

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();
    res.json({ success: true, data: populated });
  })
);

router.patch(
  '/conversations/:id/prefs',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        muted: z.boolean().optional(),
        muteHours: z.number().min(1).max(24 * 30).optional(),
        hidden: z.boolean().optional(),
        draft: z.string().max(4000).optional().nullable(),
        markedUnread: z.boolean().optional(),
      })
      .parse(req.body);

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);
    const pref = getOrCreatePref(conversation, req.user!.id);

    if (body.pinned === true) pref.pinnedAt = new Date();
    if (body.pinned === false) pref.pinnedAt = undefined;
    if (body.archived === true) pref.archivedAt = new Date();
    if (body.archived === false) pref.archivedAt = undefined;
    if (body.hidden === true) pref.hiddenAt = new Date();
    if (body.hidden === false) pref.hiddenAt = undefined;
    if (body.muted === true) {
      const hours = body.muteHours || 24 * 7;
      pref.mutedUntil = new Date(Date.now() + hours * 3600_000);
    }
    if (body.muted === false) pref.mutedUntil = undefined;
    if (body.draft !== undefined) pref.draft = body.draft || undefined;

    await conversation.save();

    if (body.markedUnread === true) {
      // Clear current user's read markers on latest message only (soft unread)
      const latest = await ChatMessage.findOne({ conversation: conversation._id })
        .sort({ createdAt: -1 })
        .select('_id');
      if (latest) {
        await ChatMessage.updateOne({ _id: latest._id }, { $pull: { readBy: req.user!.id } });
      }
    }

    res.json({
      success: true,
      data: {
        pinned: !!pref.pinnedAt,
        archived: !!pref.archivedAt,
        muted: !!(pref.mutedUntil && pref.mutedUntil > new Date()),
        draft: pref.draft || '',
        hidden: !!pref.hiddenAt,
      },
    });
  })
);

router.get(
  '/conversations/:id/messages',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    await requireMembership(id, req.user!.id);
    const userId = req.user!.id;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;

    const filter: Record<string, unknown> = {
      conversation: id,
      deletedFor: { $ne: userId },
    };
    if (before && !Number.isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const messages = await ChatMessage.find(filter)
      .populate('sender', 'name email avatar role')
      .populate({
        path: 'replyTo',
        select: 'body sender type attachments deletedForEveryoneAt',
        populate: { path: 'sender', select: 'name' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const serialized = messages
      .map((m) => serializeMessageForUser(m, userId))
      .filter(Boolean)
      .reverse();

    res.json({
      success: true,
      data: serialized,
      meta: {
        hasMore: messages.length === limit,
        oldest: messages.length ? messages[messages.length - 1].createdAt : null,
      },
    });
  })
);

router.get(
  '/conversations/:id/search',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    await requireMembership(id, req.user!.id);
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }

    const messages = await ChatMessage.find({
      conversation: id,
      deletedFor: { $ne: req.user!.id },
      deletedForEveryoneAt: { $exists: false },
      body: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    res.json({ success: true, data: messages });
  })
);

router.post(
  '/conversations/:id/messages',
  authorize('chat', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        body: z.string().trim().max(4000).optional().default(''),
        clientId: z.string().max(64).optional(),
        replyTo: z.string().optional(),
        attachments: z
          .array(
            z.object({
              name: z.string(),
              url: z.string(),
              size: z.number().optional(),
              mime: z.string().optional(),
              publicId: z.string().optional(),
            })
          )
          .max(5)
          .optional(),
        type: z.enum(['text', 'image', 'file', 'audio', 'video']).optional(),
      })
      .parse(req.body);

    if (!body.body && !(body.attachments && body.attachments.length)) {
      throw new AppError('Message body or attachment required', 400);
    }

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);

    if (body.clientId) {
      const existing = await ChatMessage.findOne({
        conversation: conversation._id,
        clientId: body.clientId,
      })
        .populate('sender', 'name email avatar role')
        .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } })
        .lean();
      if (existing) {
        res.json({ success: true, data: serializeMessageForUser(existing, req.user!.id), duplicate: true });
        return;
      }
    }

    if (body.replyTo) {
      const reply = await ChatMessage.findOne({ _id: body.replyTo, conversation: conversation._id });
      if (!reply) throw new AppError('Reply target not found', 400);
    }

    let msgType = body.type || 'text';
    if (body.attachments?.length) {
      const mime = body.attachments[0].mime || '';
      if (mime.startsWith('image/')) msgType = 'image';
      else if (mime.startsWith('video/')) msgType = 'video';
      else if (mime.startsWith('audio/')) msgType = 'audio';
      else msgType = 'file';
    }

    const message = await ChatMessage.create({
      conversation: conversation._id,
      sender: req.user!.id,
      body: body.body || '',
      type: msgType,
      clientId: body.clientId,
      attachments: (body.attachments || []).map((a) => ({
        ...a,
        uploadedBy: req.user!.id,
      })),
      replyTo: body.replyTo,
      readBy: [req.user!.id],
      deliveredTo: [req.user!.id],
    });

    const preview = previewFromMessage(body.body, body.attachments);
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = preview;
    conversation.lastMessageSender = req.user!.id as any;
    // Clear draft for sender
    const pref = getOrCreatePref(conversation, req.user!.id);
    pref.draft = undefined;
    await conversation.save();

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar role')
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } })
      .lean();

    try {
      getIO().to(`conversation:${conversation._id}`).emit('chat:message', populated);
      for (const memberId of conversation.members) {
        const mid = String(memberId);
        if (mid === req.user!.id) continue;
        const memberPref = (conversation.memberPrefs || []).find((p) => String(p.user) === mid);
        const muted = memberPref?.mutedUntil && memberPref.mutedUntil > new Date();
        getIO().to(`user:${mid}`).emit('chat:notify', {
          conversationId: String(conversation._id),
          message: populated,
          muted: !!muted,
        });
      }
      const { notifyUsers } = await import('../../utils/notify.js');
      const recipients = conversation.members
        .map((m) => String(m))
        .filter((mid) => {
          if (mid === req.user!.id) return false;
          const memberPref = (conversation.memberPrefs || []).find((p) => String(p.user) === mid);
          return !(memberPref?.mutedUntil && memberPref.mutedUntil > new Date());
        });
      await notifyUsers(recipients, {
        type: 'chat',
        title: conversation.type === 'group' ? conversation.name || 'Group chat' : req.user!.name || 'New message',
        message: preview.slice(0, 140),
        link: `/chat?c=${conversation._id}`,
        meta: { conversationId: String(conversation._id) },
        email: false,
      });
    } catch {
      /* socket optional */
    }

    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/conversations/:id/upload',
  authorize('chat', 'create'),
  chatUpload.single('file'),
  asyncHandler(async (req, res) => {
    await requireMembership(paramId(req.params.id), req.user!.id);
    if (!req.file) throw new AppError('No file uploaded', 400);

    const mime = assertSafeUploadSignature(req.file.path, req.file.mimetype);
    let url = `/api/v1/files/chat/${req.file.filename}`;
    let publicId: string | undefined;

    if (env.STORAGE_PROVIDER === 'cloudinary') {
      const cloud = await uploadDocumentToCloudinary(req.file.path, 'starmedia/chat');
      if (cloud?.secure_url) {
        url = cloud.secure_url;
        publicId = cloud.public_id;
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        name: req.file.originalname.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120),
        url,
        size: req.file.size,
        mime,
        publicId,
      },
    });
  })
);

router.patch(
  '/messages/:messageId',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) throw new NotFoundError('Message not found');
    await requireMembership(String(message.conversation), req.user!.id);

    if (String(message.sender) !== req.user!.id) throw new ForbiddenError('Can only edit your own messages');
    if (message.deletedForEveryoneAt) throw new AppError('Cannot edit a deleted message', 400);
    if (message.type === 'system') throw new AppError('Cannot edit system messages', 400);
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
      throw new AppError('Edit window expired', 400);
    }

    message.body = body;
    message.editedAt = new Date();
    await message.save();

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar role')
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } })
      .lean();

    emitToConversation(String(message.conversation), 'chat:message:update', populated);
    res.json({ success: true, data: populated });
  })
);

router.post(
  '/messages/:messageId/delete',
  authorize('chat', 'delete'),
  asyncHandler(async (req, res) => {
    const { scope } = z.object({ scope: z.enum(['me', 'everyone']) }).parse(req.body);
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) throw new NotFoundError('Message not found');
    const conversation = await requireMembership(String(message.conversation), req.user!.id);

    if (scope === 'me') {
      if (!message.deletedFor.some((id) => String(id) === req.user!.id)) {
        message.deletedFor.push(req.user!.id as any);
        await message.save();
      }
      emitToUsers([req.user!.id], 'chat:message:delete', {
        messageId: String(message._id),
        conversationId: String(conversation._id),
        scope: 'me',
      });
      res.json({ success: true, data: { scope: 'me' } });
      return;
    }

    if (String(message.sender) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only the sender can delete for everyone');
    }
    if (Date.now() - new Date(message.createdAt).getTime() > DELETE_FOR_EVERYONE_MS && req.user!.role !== 'ceo') {
      throw new AppError('Delete-for-everyone window expired (1 hour)', 400);
    }

    message.deletedForEveryoneAt = new Date();
    message.deletedBy = req.user!.id as any;
    message.body = '';
    message.attachments = [];
    await message.save();

    emitToConversation(String(conversation._id), 'chat:message:delete', {
      messageId: String(message._id),
      conversationId: String(conversation._id),
      scope: 'everyone',
    });

    res.json({ success: true, data: { scope: 'everyone' } });
  })
);

router.post(
  '/messages/:messageId/react',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const { emoji } = z.object({ emoji: z.string().min(1).max(16) }).parse(req.body);
    const message = await ChatMessage.findById(req.params.messageId);
    if (!message) throw new NotFoundError('Message not found');
    await requireMembership(String(message.conversation), req.user!.id);
    if (message.deletedForEveryoneAt) throw new AppError('Cannot react to deleted message', 400);

    let reaction = message.reactions.find((r) => r.emoji === emoji);
    if (!reaction) {
      message.reactions.push({ emoji, users: [req.user!.id as any] });
    } else {
      const idx = reaction.users.findIndex((u) => String(u) === req.user!.id);
      if (idx >= 0) reaction.users.splice(idx, 1);
      else reaction.users.push(req.user!.id as any);
      if (reaction.users.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      }
    }
    await message.save();

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar role')
      .lean();

    emitToConversation(String(message.conversation), 'chat:message:update', populated);
    res.json({ success: true, data: populated });
  })
);

router.post(
  '/messages/:messageId/forward',
  authorize('chat', 'create'),
  asyncHandler(async (req, res) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(req.body);
    const source = await ChatMessage.findById(req.params.messageId);
    if (!source || source.deletedForEveryoneAt) throw new NotFoundError('Message not found');
    await requireMembership(String(source.conversation), req.user!.id);
    const target = await requireMembership(conversationId, req.user!.id);

    const message = await ChatMessage.create({
      conversation: target._id,
      sender: req.user!.id,
      body: source.body,
      type: source.type === 'system' ? 'text' : source.type,
      attachments: source.attachments,
      forwardedFrom: source._id,
      readBy: [req.user!.id],
      deliveredTo: [req.user!.id],
      clientId: `fwd-${source._id}-${Date.now()}`,
    });

    target.lastMessageAt = message.createdAt;
    target.lastMessagePreview = previewFromMessage(source.body, source.attachments);
    target.lastMessageSender = req.user!.id as any;
    await target.save();

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar role')
      .lean();

    emitToConversation(String(target._id), 'chat:message', populated);
    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/conversations/:id/read',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const conversation = await requireMembership(id, req.user!.id);
    const result = await ChatMessage.updateMany(
      {
        conversation: id,
        sender: { $ne: req.user!.id },
        readBy: { $ne: req.user!.id },
        deletedForEveryoneAt: { $exists: false },
      },
      { $addToSet: { readBy: req.user!.id, deliveredTo: req.user!.id } }
    );

    const pref = getOrCreatePref(conversation, req.user!.id);
    pref.lastReadAt = new Date();
    await conversation.save();

    emitToConversation(id, 'chat:read', {
      conversationId: id,
      userId: req.user!.id,
      count: result.modifiedCount,
    });

    res.json({ success: true, data: { read: true, updated: result.modifiedCount } });
  })
);

router.patch(
  '/conversations/:id/members',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
        promoteAdmin: z.array(z.string()).optional(),
        demoteAdmin: z.array(z.string()).optional(),
        leave: z.boolean().optional(),
      })
      .parse(req.body);

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);
    if (conversation.type !== 'group') throw new AppError('Only group chats support membership changes', 400);

    if (body.leave) {
      const sys = await createSystemMessage(
        String(conversation._id),
        `${req.user!.name || 'Someone'} left the group`,
        req.user!.id
      );
      conversation.members = conversation.members.filter((m) => String(m) !== req.user!.id) as typeof conversation.members;
      conversation.admins = (conversation.admins || []).filter(
        (a) => String(a) !== req.user!.id
      ) as typeof conversation.admins;
      if ((!conversation.admins || conversation.admins.length === 0) && conversation.members.length > 0) {
        conversation.admins = [conversation.members[0]] as typeof conversation.admins;
      }
      conversation.lastMessageAt = new Date();
      conversation.lastMessagePreview = sys?.body?.slice(0, 120);
      conversation.lastMessageSender = req.user!.id as any;
      await conversation.save();
      emitToConversation(String(conversation._id), 'chat:message', sys);
      res.json({ success: true, data: { left: true } });
      return;
    }

    if (!isAdmin(conversation, req.user!.id, req.user!.role)) {
      throw new ForbiddenError('Only group admins can manage members');
    }

    const memberSet = new Set(conversation.members.map(String));
    const adminSet = new Set((conversation.admins || []).map(String));
    if (!adminSet.size) adminSet.add(String(conversation.createdBy));

    for (const id of body.add || []) {
      if (mongoose.isValidObjectId(id)) memberSet.add(id);
    }
    for (const id of body.remove || []) {
      if (id !== req.user!.id) {
        memberSet.delete(id);
        adminSet.delete(id);
      }
    }
    for (const id of body.promoteAdmin || []) {
      if (memberSet.has(id)) adminSet.add(id);
    }
    for (const id of body.demoteAdmin || []) {
      if (id !== String(conversation.createdBy)) adminSet.delete(id);
    }

    if (memberSet.size < 2) throw new AppError('Group must keep at least two members', 400);

    conversation.members = [...memberSet].map((id) => new mongoose.Types.ObjectId(id));
    conversation.admins = [...adminSet].map((id) => new mongoose.Types.ObjectId(id));
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();
    emitToConversation(String(conversation._id), 'chat:conversation:update', populated);
    res.json({ success: true, data: populated });
  })
);

export default router;
