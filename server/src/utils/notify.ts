import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { getIO } from '../config/socket.js';
import { sendEmail } from './mailer.js';
import type { Role } from '../config/permissions.js';

export type NotifyPayload = {
  type: string;
  title: string;
  message: string;
  link?: string;
  meta?: unknown;
  /** Send email as well (default true except for chat) */
  email?: boolean;
};

function uniqueIds(ids: Array<string | undefined | null>) {
  return [...new Set(ids.map((id) => (id ? String(id) : '')).filter(Boolean))];
}

/** Persist in-app notifications, push over socket, optionally email. */
export async function notifyUsers(userIds: Array<string | undefined | null>, payload: NotifyPayload) {
  const unique = uniqueIds(userIds);
  if (!unique.length) return;

  const docs = await Notification.insertMany(
    unique.map((user) => ({
      user,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      meta: payload.meta,
    }))
  );

  try {
    const io = getIO();
    for (let i = 0; i < unique.length; i++) {
      const uid = unique[i];
      const doc = docs[i];
      io.to(`user:${uid}`).emit('notification', {
        _id: String(doc._id),
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        meta: payload.meta,
        createdAt: doc.createdAt,
        readAt: null,
      });
    }
  } catch {
    /* socket may be unavailable in tests */
  }

  const sendMail = payload.email ?? payload.type !== 'chat';
  if (!sendMail) return;

  const users = await User.find({ _id: { $in: unique }, status: 'active' }).select('email name');
  await Promise.all(
    users.map((u) =>
      sendEmail({
        to: u.email,
        subject: payload.title,
        html: `<p>${payload.message}</p>${
          payload.link ? `<p><a href="${payload.link}">Open in STAR MEDIA CRM</a></p>` : ''
        }`,
      }).catch(() => undefined)
    )
  );
}

export async function notifyRoles(roles: Role[], payload: NotifyPayload) {
  const users = await User.find({ role: { $in: roles }, status: 'active' }).select('_id');
  await notifyUsers(
    users.map((u) => String(u._id)),
    payload
  );
}

export async function notifyCeos(payload: NotifyPayload) {
  await notifyRoles(['ceo'], payload);
}
