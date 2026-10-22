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

function isAllowedOrigin(origin: string): boolean {
  const norm = origin.replace(/\/+$/, '');
  if (env.clientOrigins.includes(norm)) return true;
  if (env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(norm)) return true;
  // Preview wildcards only outside production (add preview URLs to CLIENT_URL in prod)
  if (env.NODE_ENV !== 'production' && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(norm)) {
    return true;
  }
  return false;
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
    logger.debug({ userId }, 'Socket connected');

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
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on(
      'chat:message',
      async (
        msg: { conversationId: string; body: string; clientId?: string },
        ack?: (r: { ok: boolean; data?: unknown; error?: string }) => void
      ) => {
        try {
          const body = String(msg?.body || '').trim();
          if (!body || body.length > 4000) {
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
              .populate('sender', 'name email avatar')
              .lean();
            if (existing) {
              ack?.({ ok: true, data: existing });
              return;
            }
          }

          const message = await ChatMessage.create({
            conversation: conversation._id,
            sender: userId,
            body,
            clientId: msg.clientId,
            readBy: [userId],
          });
          conversation.lastMessageAt = message.createdAt;
          conversation.lastMessagePreview = body.slice(0, 120);
          await conversation.save();

          const populated = await ChatMessage.findById(message._id)
            .populate('sender', 'name email avatar')
            .lean();

          io?.to(`conversation:${conversation._id}`).emit('chat:message', populated);

          for (const memberId of conversation.members) {
            const mid = String(memberId);
            if (mid === userId) continue;
            io?.to(`user:${mid}`).emit('chat:notify', {
              conversationId: String(conversation._id),
              message: populated,
            });
          }
          const { notifyUsers } = await import('../utils/notify.js');
          const recipients = conversation.members.map((m) => String(m)).filter((mid) => mid !== userId);
          await notifyUsers(recipients, {
            type: 'chat',
            title: 'New message',
            message: body.slice(0, 140),
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
      logger.debug({ userId }, 'Socket disconnected');
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}
