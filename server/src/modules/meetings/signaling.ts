import type { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Meeting } from '../../models/Meeting.js';
import { User } from '../../models/User.js';
import { logger } from '../../utils/logger.js';

type ParticipantMeta = {
  userId: string;
  name: string;
  avatar?: string;
  muted: boolean;
  videoOff: boolean;
  handRaised: boolean;
  screenSharing: boolean;
  socketId: string;
};

/** meetingId -> userId -> ParticipantMeta */
const rooms = new Map<string, Map<string, ParticipantMeta>>();

function roomKey(meetingId: string) {
  return `meeting:${meetingId}`;
}

async function assertMeetingAccess(meetingId: string, userId: string) {
  if (!mongoose.isValidObjectId(meetingId)) return null;
  const meeting = await Meeting.findById(meetingId).select('host invitees status code title');
  if (!meeting || meeting.status === 'ended') return null;
  return meeting;
}

export function registerMeetingSignaling(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(
    'meet:join',
    async (
      payload: { meetingId: string },
      ack?: (r: { ok: boolean; error?: string; peers?: ParticipantMeta[]; meeting?: unknown }) => void
    ) => {
      try {
        const meetingId = payload?.meetingId;
        const meeting = await assertMeetingAccess(meetingId, userId);
        if (!meeting) {
          ack?.({ ok: false, error: 'Meeting not available' });
          return;
        }

        const user = await User.findById(userId).select('name avatar').lean();
        if (!user) {
          ack?.({ ok: false, error: 'User not found' });
          return;
        }

        if (meeting.status === 'scheduled') {
          meeting.status = 'live';
          meeting.startedAt = meeting.startedAt || new Date();
          await meeting.save();
        }

        socket.join(roomKey(meetingId));
        if (!rooms.has(meetingId)) rooms.set(meetingId, new Map());
        const room = rooms.get(meetingId)!;

        const peer: ParticipantMeta = {
          userId,
          name: user.name || 'User',
          avatar: (user as { avatar?: string }).avatar,
          muted: false,
          videoOff: false,
          handRaised: false,
          screenSharing: false,
          socketId: socket.id,
        };
        room.set(userId, peer);

        const peers = [...room.values()].filter((p) => p.userId !== userId);
        socket.to(roomKey(meetingId)).emit('meet:peer-joined', peer);
        ack?.({
          ok: true,
          peers,
          meeting: {
            _id: String(meeting._id),
            code: meeting.code,
            title: meeting.title,
            host: String(meeting.host),
            status: meeting.status,
          },
        });
      } catch (err) {
        logger.warn({ err }, 'meet:join failed');
        ack?.({ ok: false, error: 'Join failed' });
      }
    }
  );

  socket.on('meet:leave', (payload: { meetingId: string }) => {
    leaveMeeting(io, socket, userId, payload?.meetingId);
  });

  socket.on(
    'meet:signal',
    (payload: { meetingId: string; to: string; data: unknown }) => {
      if (!payload?.meetingId || !payload?.to) return;
      const room = rooms.get(payload.meetingId);
      const target = room?.get(payload.to);
      if (!target) return;
      io.to(target.socketId).emit('meet:signal', {
        from: userId,
        data: payload.data,
      });
    }
  );

  socket.on(
    'meet:state',
    (payload: {
      meetingId: string;
      muted?: boolean;
      videoOff?: boolean;
      handRaised?: boolean;
      screenSharing?: boolean;
    }) => {
      const room = rooms.get(payload?.meetingId);
      const me = room?.get(userId);
      if (!me) return;
      if (typeof payload.muted === 'boolean') me.muted = payload.muted;
      if (typeof payload.videoOff === 'boolean') me.videoOff = payload.videoOff;
      if (typeof payload.handRaised === 'boolean') me.handRaised = payload.handRaised;
      if (typeof payload.screenSharing === 'boolean') me.screenSharing = payload.screenSharing;
      socket.to(roomKey(payload.meetingId)).emit('meet:peer-state', {
        userId,
        muted: me.muted,
        videoOff: me.videoOff,
        handRaised: me.handRaised,
        screenSharing: me.screenSharing,
      });
    }
  );

  socket.on(
    'meet:chat',
    (payload: { meetingId: string; body: string }, ack?: (r: { ok: boolean }) => void) => {
      const body = String(payload?.body || '').trim().slice(0, 1000);
      if (!body || !rooms.get(payload?.meetingId)?.has(userId)) {
        ack?.({ ok: false });
        return;
      }
      const me = rooms.get(payload.meetingId)!.get(userId)!;
      io.to(roomKey(payload.meetingId)).emit('meet:chat', {
        id: `${Date.now()}-${userId}`,
        userId,
        name: me.name,
        body,
        at: new Date().toISOString(),
      });
      ack?.({ ok: true });
    }
  );

  socket.on(
    'meet:reaction',
    (payload: { meetingId: string; emoji: string }) => {
      if (!rooms.get(payload?.meetingId)?.has(userId)) return;
      const emoji = String(payload.emoji || '').slice(0, 8);
      if (!emoji) return;
      io.to(roomKey(payload.meetingId)).emit('meet:reaction', {
        userId,
        emoji,
        at: new Date().toISOString(),
      });
    }
  );

  socket.on('disconnect', () => {
    for (const meetingId of [...rooms.keys()]) {
      if (rooms.get(meetingId)?.has(userId)) {
        leaveMeeting(io, socket, userId, meetingId);
      }
    }
  });
}

function leaveMeeting(io: Server, socket: Socket, userId: string, meetingId?: string) {
  if (!meetingId) return;
  const room = rooms.get(meetingId);
  if (!room?.has(userId)) return;
  room.delete(userId);
  socket.leave(roomKey(meetingId));
  socket.to(roomKey(meetingId)).emit('meet:peer-left', { userId });
  if (room.size === 0) rooms.delete(meetingId);
}

/** Host ended the call — kick everyone and drop in-memory room state. */
export function forceEndMeetingRoom(io: Server, meetingId: string) {
  if (!meetingId) return;
  io.to(roomKey(meetingId)).emit('meet:ended', { meetingId, reason: 'host_ended' });
  rooms.delete(meetingId);
}
