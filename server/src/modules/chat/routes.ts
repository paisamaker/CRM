import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Conversation } from '../../models/Conversation.js';
import { ChatMessage } from '../../models/ChatMessage.js';
import { User } from '../../models/User.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { getIO } from '../../config/socket.js';

const router = Router();
router.use(authenticate);

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function isMember(conversation: { members: mongoose.Types.ObjectId[] }, userId: string): boolean {
  return conversation.members.some((m) => String(m) === userId);
}

async function requireMembership(conversationId: string, userId: string) {
  if (!mongoose.isValidObjectId(conversationId)) throw new NotFoundError('Conversation not found');
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');
  if (!isMember(conversation, userId)) throw new ForbiddenError('Not a member of this conversation');
  return conversation;
}

/** Directory of active colleagues for starting chats */
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

router.get(
  '/conversations',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const conversations = await Conversation.find({ members: userId })
      .populate('members', 'name email avatar role')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(100)
      .lean();

    const withUnread = await Promise.all(
      conversations.map(async (c) => {
        const unread = await ChatMessage.countDocuments({
          conversation: c._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
        });
        return { ...c, unread };
      })
    );

    res.json({ success: true, data: withUnread });
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
        createdBy: req.user!.id,
      });
    }

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
        projectId: z.string().optional(),
      })
      .parse(req.body);

    const unique = [...new Set([req.user!.id, ...body.memberIds])];
    const validUsers = await User.find({ _id: { $in: unique }, status: 'active' }).select('_id');
    if (validUsers.length < 2) throw new AppError('At least two active members required', 400);

    const conversation = await Conversation.create({
      type: 'group',
      name: body.name,
      members: validUsers.map((u) => u._id),
      createdBy: req.user!.id,
      project: body.projectId,
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();

    res.status(201).json({ success: true, data: populated });
  })
);

router.get(
  '/conversations/:id/messages',
  authorize('chat', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    await requireMembership(id, req.user!.id);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;

    const filter: Record<string, unknown> = { conversation: id };
    if (before && !Number.isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const messages = await ChatMessage.find(filter)
      .populate('sender', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: messages.reverse() });
  })
);

router.post(
  '/conversations/:id/messages',
  authorize('chat', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        body: z.string().trim().min(1).max(4000),
        clientId: z.string().max(64).optional(),
      })
      .parse(req.body);

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);

    if (body.clientId) {
      const existing = await ChatMessage.findOne({
        conversation: conversation._id,
        clientId: body.clientId,
      })
        .populate('sender', 'name email avatar')
        .lean();
      if (existing) {
        res.json({ success: true, data: existing, duplicate: true });
        return;
      }
    }

    const message = await ChatMessage.create({
      conversation: conversation._id,
      sender: req.user!.id,
      body: body.body,
      clientId: body.clientId,
      readBy: [req.user!.id],
    });

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = body.body.slice(0, 120);
    await conversation.save();

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email avatar')
      .lean();

    try {
      getIO().to(`conversation:${conversation._id}`).emit('chat:message', populated);
      for (const memberId of conversation.members) {
        const mid = String(memberId);
        if (mid === req.user!.id) continue;
        getIO().to(`user:${mid}`).emit('chat:notify', {
          conversationId: String(conversation._id),
          message: populated,
        });
      }
      const { notifyUsers } = await import('../../utils/notify.js');
      const recipients = conversation.members
        .map((m) => String(m))
        .filter((mid) => mid !== req.user!.id);
      await notifyUsers(recipients, {
        type: 'chat',
        title: 'New message',
        message: body.body.slice(0, 140),
        link: `/chat?c=${conversation._id}`,
        meta: { conversationId: String(conversation._id) },
        email: false,
      });
    } catch {
      /* socket optional in tests */
    }

    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/conversations/:id/read',
  authorize('chat', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    await requireMembership(id, req.user!.id);
    await ChatMessage.updateMany(
      {
        conversation: id,
        sender: { $ne: req.user!.id },
        readBy: { $ne: req.user!.id },
      },
      { $addToSet: { readBy: req.user!.id } }
    );
    res.json({ success: true, data: { read: true } });
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
      })
      .parse(req.body);

    const conversation = await requireMembership(paramId(req.params.id), req.user!.id);
    if (conversation.type !== 'group') throw new AppError('Only group chats support membership changes', 400);
    if (String(conversation.createdBy) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only the group creator or CEO can manage members');
    }

    const memberSet = new Set(conversation.members.map(String));
    for (const id of body.add || []) {
      if (mongoose.isValidObjectId(id)) memberSet.add(id);
    }
    for (const id of body.remove || []) {
      if (id !== req.user!.id) memberSet.delete(id);
    }
    if (memberSet.size < 2) throw new AppError('Group must keep at least two members', 400);

    conversation.members = [...memberSet].map((id) => new mongoose.Types.ObjectId(id));
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('members', 'name email avatar role')
      .lean();
    res.json({ success: true, data: populated });
  })
);

export default router;
