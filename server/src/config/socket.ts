import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { env } from './env.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { logger } from '../utils/logger.js';
import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { User } from '../models/User.js';

let io: Server | null = null;

/** userId -> number of active sockets (multi-tab / multi-device) */
const presenceCounts = new Map<string, number>();
/** userId -> lastSeen ISO */
const lastSeenMap = new Map<string, string>();

function isAllowedOrigin(origin: string): boolean {
  const norm = origin.replace(/\/+$/, '');
  if (env.clientOrigins.includes(norm)) return true;
  if (env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(norm)) return true;
  if (env.NODE_ENV !== 'production' && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(norm)) {
    return true;
  }
  return false;
}

export function getOnlineUserIds(): string[] {
  return [...presenceCounts.keys()].filter((id) => (presenceCounts.get(id) || 0) > 0);
}

export function isUserOnline(userId: string): boolean {
  return (presenceCounts.get(userId) || 0) > 0;
}

function bumpPresence(userId: string, delta: number) {
  const next = Math.max(0, (presenceCounts.get(userId) || 0) + delta);
  if (next === 0) {
    presenceCounts.delete(userId);
    lastSeenMap.set(userId, new Date().toISOString());
  } else {
    presenceCounts.set(userId, next);
  }
  return next;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (isAllowedOrigin(origin)) callback(null, true);
        else callback(new Error('Socket CORS blocked'));
      },
      credentials: true,
    },
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers.authorization as string)?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyAccessToken(token);
      if (payload.purpose === 'mfa' || !payload.mfaVerified) {
        return next(new Error('MFA verification required'));
      }
      const user = await User.findById(payload.sub).select('status mfa.enabled').lean();
      if (!user || user.status === 'disabled' || user.status === 'locked') {
        return next(new Error('Unauthorized'));
      }
      if (user.mfa?.enabled && !payload.mfaVerified) {
        return next(new Error('MFA verification required'));
      }
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    const count = bumpPresence(userId, 1);
    if (count === 1) {
      io?.emit('presence:update', { userId, online: true });
    }

    // Deliver pending: mark messages as delivered for this user
    void (async () => {
      try {
        await ChatMessage.updateMany(
          {
            sender: { $ne: userId },
            deliveredTo: { $ne: userId },
            deletedForEveryoneAt: { $exists: false },
            conversation: {
              $in: await Conversation.find({ members: userId }).distinct('_id'),
            },
          },
          { $addToSet: { deliveredTo: userId } }
        );
      } catch (err) {
        logger.debug({ err }, 'deliver-on-connect skipped');
      }
    })();

    logger.debug({ userId }, 'Socket connected');

    socket.on('presence:ping', () => {
      socket.emit('presence:pong', {
        onlineIds: getOnlineUserIds(),
        serverTime: new Date().toISOString(),
      });
    });

    socket.on('chat:join', async (conversationId: string, ack?: (r: { ok: boolean; error?: string }) => void) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) {
          ack?.({ ok: false, error: 'Invalid conversation' });
          return;
        }
        const conversation = await Conversation.findById(conversationId).select('members');
        if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
          ack?.({ ok: false, error: 'Forbidden' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Join failed' });
      }
    });

    socket.on('chat:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.leave(`conversation:${conversationId}`);
    });

    socket.on(
      'chat:typing',
      async (payload: { conversationId: string; typing: boolean }, ack?: (r: { ok: boolean }) => void) => {
        try {
          const conversationId = payload?.conversationId;
          if (!mongoose.isValidObjectId(conversationId)) {
            ack?.({ ok: false });
            return;
          }
          const conversation = await Conversation.findById(conversationId).select('members');
          if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
            ack?.({ ok: false });
            return;
          }
          socket.to(`conversation:${conversationId}`).emit('chat:typing', {
            conversationId,
            userId,
            typing: !!payload.typing,
          });
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      }
    );

    socket.on(
      'chat:message',
      async (
        msg: {
          conversationId: string;
          body: string;
          clientId?: string;
          replyTo?: string;
          attachments?: Array<{ name: string; url: string; size?: number; mime?: string; publicId?: string }>;
        },
        ack?: (r: { ok: boolean; data?: unknown; error?: string }) => void
      ) => {
        try {
          const body = String(msg?.body || '').trim();
          const attachments = Array.isArray(msg.attachments) ? msg.attachments.slice(0, 5) : [];
          if ((!body && !attachments.length) || body.length > 4000) {
            ack?.({ ok: false, error: 'Invalid message' });
            return;
          }
          if (!mongoose.isValidObjectId(msg.conversationId)) {
            ack?.({ ok: false, error: 'Invalid conversation' });
            return;
          }

          const conversation = await Conversation.findById(msg.conversationId);
          if (!conversation || !conversation.members.some((m) => String(m) === userId)) {
            ack?.({ ok: false, error: 'Forbidden' });
            return;
          }

          if (msg.clientId) {
            const existing = await ChatMessage.findOne({
              conversation: conversation._id,
              clientId: msg.clientId,
            })
              .populate('sender', 'name email avatar role')
              .lean();
            if (existing) {
              ack?.({ ok: true, data: existing });
              return;
            }
          }

          let msgType: 'text' | 'image' | 'file' | 'audio' | 'video' = 'text';
          if (attachments.length) {
            const mime = attachments[0].mime || '';
            if (mime.startsWith('image/')) msgType = 'image';
            else if (mime.startsWith('video/')) msgType = 'video';
            else if (mime.startsWith('audio/')) msgType = 'audio';
            else msgType = 'file';
          }

          const message = await ChatMessage.create({
            conversation: conversation._id,
            sender: userId,
            body,
            type: msgType,
            clientId: msg.clientId,
            attachments: attachments.map((a) => ({ ...a, uploadedBy: userId })),
            replyTo: msg.replyTo && mongoose.isValidObjectId(msg.replyTo) ? msg.replyTo : undefined,
            readBy: [userId],
            deliveredTo: [userId],
          });

          const preview = attachments.length
            ? attachments[0].mime?.startsWith('image/')
              ? '📷 Photo'
              : attachments[0].mime?.startsWith('audio/')
                ? '🎤 Voice message'
                : `📎 ${attachments[0].name || 'File'}`
            : body.slice(0, 120);

          conversation.lastMessageAt = message.createdAt;
          conversation.lastMessagePreview = preview;
          conversation.lastMessageSender = userId as any;
          await conversation.save();

          const populated = await ChatMessage.findById(message._id)
            .populate('sender', 'name email avatar role')
            .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } })
            .lean();

          io?.to(`conversation:${conversation._id}`).emit('chat:message', populated);

          for (const memberId of conversation.members) {
            const mid = String(memberId);
            if (mid === userId) continue;
            const memberPref = (conversation.memberPrefs || []).find((p) => String(p.user) === mid);
            const muted = memberPref?.mutedUntil && memberPref.mutedUntil > new Date();
            io?.to(`user:${mid}`).emit('chat:notify', {
              conversationId: String(conversation._id),
              message: populated,
              muted: !!muted,
            });
          }

          const { notifyUsers } = await import('../utils/notify.js');
          const recipients = conversation.members
            .map((m) => String(m))
            .filter((mid) => {
              if (mid === userId) return false;
              const memberPref = (conversation.memberPrefs || []).find((p) => String(p.user) === mid);
              return !(memberPref?.mutedUntil && memberPref.mutedUntil > new Date());
            });
          await notifyUsers(recipients, {
            type: 'chat',
            title: conversation.type === 'group' ? conversation.name || 'Group chat' : 'New message',
            message: preview.slice(0, 140),
            link: `/chat?c=${conversation._id}`,
            meta: { conversationId: String(conversation._id) },
            email: false,
          });

          ack?.({ ok: true, data: populated });
        } catch (err) {
          logger.warn({ err }, 'chat:message failed');
          ack?.({ ok: false, error: 'Send failed' });
        }
      }
    );

    socket.on('disconnect', () => {
      const remaining = bumpPresence(userId, -1);
      if (remaining === 0) {
        io?.emit('presence:update', {
          userId,
          online: false,
          lastSeen: lastSeenMap.get(userId),
        });
      }
      logger.debug({ userId }, 'Socket disconnected');
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}
