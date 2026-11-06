import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { notifyUsers } from '../../utils/notify.js';
import { User } from '../../models/User.js';
import { Meeting, generateMeetingCode } from '../../models/Meeting.js';
import { getIO, getOnlineUserIds, isUserOnline } from '../../config/socket.js';
import { forceEndMeetingRoom } from './signaling.js';

const router = Router();
router.use(authenticate);

function paramId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return id[0] || '';
  return id || '';
}

function canAccessMeeting(
  meeting: { host: unknown; invitees: unknown[] },
  userId: string
): boolean {
  if (String(meeting.host) === userId) return true;
  return (meeting.invitees || []).some((i) => String(i) === userId);
}

function hostLabel(user: { name?: string; email?: string } | undefined) {
  return user?.name?.trim() || user?.email || 'A colleague';
}

function formatWhen(d?: Date | string | null) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function notifyMeetingInvitees(
  inviteeIds: string[],
  opts: {
    hostName: string;
    title: string;
    code: string;
    meetingId: string;
    startNow: boolean;
    scheduledAt?: Date | string | null;
  }
) {
  if (!inviteeIds.length) return;
  const when = !opts.startNow ? formatWhen(opts.scheduledAt) : '';
  await notifyUsers(inviteeIds, {
    type: 'meeting',
    title: opts.startNow ? 'Meeting invitation' : 'Meeting scheduled',
    message: opts.startNow
      ? `${opts.hostName} invited you to “${opts.title}” · join now (${opts.code})`
      : `${opts.hostName} scheduled “${opts.title}”${when ? ` for ${when}` : ''} · code ${opts.code}`,
    link: `/meetings/room/${opts.code}`,
    meta: {
      meetingId: opts.meetingId,
      code: opts.code,
      status: opts.startNow ? 'live' : 'scheduled',
      scheduledAt: opts.scheduledAt || null,
    },
    email: false,
  });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  inviteeIds: z.array(z.string()).max(50).optional().default([]),
  scheduledAt: z.string().optional().nullable(),
  startNow: z.boolean().optional().default(true),
  settings: z
    .object({
      muteOnJoin: z.boolean().optional(),
      videoOnJoin: z.boolean().optional(),
      waitingRoom: z.boolean().optional(),
    })
    .optional(),
});

/** Employee directory with live online status */
router.get(
  '/employees',
  authorize('meetings', 'read'),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const filter: Record<string, unknown> = {
      status: 'active',
      _id: { $ne: req.user!.id },
    };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('name email role department designation avatar status')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    const onlineIds = new Set(getOnlineUserIds());
    const items = users.map((u) => ({
      ...u,
      online: onlineIds.has(String(u._id)),
    }));

    res.json({
      success: true,
      data: {
        items,
        onlineCount: items.filter((i) => i.online).length,
        total: items.length,
      },
    });
  })
);

router.get(
  '/',
  authorize('meetings', 'read'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const status = String(req.query.status || '').trim();
    const filter: Record<string, unknown> = {
      $or: [{ host: userId }, { invitees: userId }],
    };
    if (status && ['scheduled', 'live', 'ended'].includes(status)) {
      filter.status = status;
    } else {
      filter.status = { $ne: 'ended' };
    }

    const items = await Meeting.find(filter)
      .populate('host', 'name email avatar role')
      .populate('invitees', 'name email avatar role')
      .sort({ status: 1, scheduledAt: 1, createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: { items } });
  })
);

router.get(
  '/:idOrCode',
  authorize('meetings', 'read'),
  asyncHandler(async (req, res) => {
    const key = paramId(req.params.idOrCode);
    const userId = req.user!.id;
    const query = mongoose.isValidObjectId(key)
      ? { $or: [{ _id: key }, { code: key.toUpperCase() }] }
      : { code: key.toUpperCase() };

    const meeting = await Meeting.findOne(query)
      .populate('host', 'name email avatar role')
      .populate('invitees', 'name email avatar role')
      .lean();
    if (!meeting) throw new NotFoundError('Meeting not found');

    const hostRaw = meeting.host as unknown as { _id?: string } | string;
    const hostId = String(typeof hostRaw === 'object' && hostRaw?._id ? hostRaw._id : hostRaw);
    const inviteeIds = (meeting.invitees || []).map((i: unknown) => {
      const row = i as { _id?: string } | string;
      return String(typeof row === 'object' && row?._id ? row._id : row);
    });
    if (hostId !== userId && !inviteeIds.includes(userId) && meeting.status === 'ended') {
      throw new ForbiddenError('Not invited to this meeting');
    }
    // Allow join by code for scheduled/live even if not yet invited (open join by link)
    // Host can always access; invitees always; others may join live meetings by code
    const allowed =
      hostId === userId ||
      inviteeIds.includes(userId) ||
      meeting.status === 'live' ||
      meeting.status === 'scheduled';
    if (!allowed) throw new ForbiddenError('Not invited to this meeting');

    res.json({
      success: true,
      data: {
        ...meeting,
        hostOnline: isUserOnline(hostId),
      },
    });
  })
);

router.post(
  '/',
  authorize('meetings', 'create'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const userId = req.user!.id;

    const inviteeIds = [...new Set((body.inviteeIds || []).filter((id) => mongoose.isValidObjectId(id) && id !== userId))];
    if (inviteeIds.length) {
      const count = await User.countDocuments({ _id: { $in: inviteeIds }, status: 'active' });
      if (count !== inviteeIds.length) throw new AppError('One or more invitees are invalid', 400);
    }

    let code = generateMeetingCode();
    for (let i = 0; i < 5; i++) {
      const exists = await Meeting.exists({ code });
      if (!exists) break;
      code = generateMeetingCode();
    }

    const startNow = body.startNow !== false;
    const meeting = await Meeting.create({
      code,
      title: body.title.trim(),
      description: body.description || undefined,
      host: userId,
      invitees: inviteeIds,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : startNow ? new Date() : undefined,
      status: startNow ? 'live' : 'scheduled',
      startedAt: startNow ? new Date() : undefined,
      settings: {
        muteOnJoin: body.settings?.muteOnJoin ?? false,
        videoOnJoin: body.settings?.videoOnJoin ?? true,
        waitingRoom: body.settings?.waitingRoom ?? false,
      },
      createdBy: userId,
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('host', 'name email avatar role')
      .populate('invitees', 'name email avatar role');

    await notifyMeetingInvitees(inviteeIds, {
      hostName: hostLabel(req.user),
      title: meeting.title,
      code: meeting.code,
      meetingId: String(meeting._id),
      startNow,
      scheduledAt: meeting.scheduledAt,
    });

    await writeAudit({
      actor: userId,
      action: 'create',
      entity: 'Meeting',
      entityId: String(meeting._id),
      after: { code, title: meeting.title },
      req,
    });

    res.status(201).json({ success: true, data: populated });
  })
);

router.post(
  '/:id/invite',
  authorize('meetings', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const inviteeIds = z.array(z.string()).min(1).max(50).parse(req.body.inviteeIds || []);
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (String(meeting.host) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only the host can invite');
    }
    if (meeting.status === 'ended') throw new AppError('Meeting already ended', 400);

    const valid = inviteeIds.filter(
      (uid) => mongoose.isValidObjectId(uid) && uid !== String(meeting.host)
    );
    const existing = new Set(meeting.invitees.map(String));
    const newlyInvited = valid.filter((uid) => !existing.has(uid));
    for (const uid of valid) existing.add(uid);
    meeting.invitees = [...existing].map((x) => x as unknown as mongoose.Types.ObjectId);
    await meeting.save();

    await notifyMeetingInvitees(newlyInvited, {
      hostName: hostLabel(req.user),
      title: meeting.title,
      code: meeting.code,
      meetingId: String(meeting._id),
      startNow: meeting.status === 'live',
      scheduledAt: meeting.scheduledAt,
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('host', 'name email avatar role')
      .populate('invitees', 'name email avatar role');

    res.json({ success: true, data: populated, meta: { invited: newlyInvited.length } });
  })
);

router.post(
  '/:id/start',
  authorize('meetings', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (!canAccessMeeting(meeting, req.user!.id)) throw new ForbiddenError();
    if (meeting.status === 'ended') throw new AppError('Meeting already ended', 400);
    const wasScheduled = meeting.status === 'scheduled';
    meeting.status = 'live';
    meeting.startedAt = meeting.startedAt || new Date();
    await meeting.save();

    if (wasScheduled) {
      const inviteeIds = meeting.invitees.map(String).filter((id) => id !== req.user!.id);
      if (inviteeIds.length) {
        await notifyUsers(inviteeIds, {
          type: 'meeting',
          title: 'Meeting started',
          message: `“${meeting.title}” is live now · join with code ${meeting.code}`,
          link: `/meetings/room/${meeting.code}`,
          meta: { meetingId: String(meeting._id), code: meeting.code, status: 'live' },
          email: false,
        });
      }
    }

    res.json({ success: true, data: meeting });
  })
);

router.post(
  '/:id/end',
  authorize('meetings', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (String(meeting.host) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only the host can end the meeting');
    }

    const meetingId = String(meeting._id);
    const snapshot = {
      _id: meetingId,
      code: meeting.code,
      title: meeting.title,
    };

    await meeting.deleteOne();

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Meeting',
      entityId: meetingId,
      before: { code: snapshot.code, title: snapshot.title, endedByHost: true },
      req,
    });

    try {
      forceEndMeetingRoom(getIO(), meetingId);
    } catch {
      /* socket may be unavailable */
    }

    res.json({ success: true, data: { ...snapshot, deleted: true } });
  })
);

router.delete(
  '/:id',
  authorize('meetings', 'delete'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    const meeting = await Meeting.findById(id);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (String(meeting.host) !== req.user!.id && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only the host can delete the meeting');
    }
    await meeting.deleteOne();
    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Meeting',
      entityId: id,
      req,
    });
    res.json({ success: true, message: 'Meeting deleted' });
  })
);

export default router;
