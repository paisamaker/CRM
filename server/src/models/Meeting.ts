import mongoose, { Schema, type Document, type Types } from 'mongoose';
import crypto from 'crypto';

export const MEETING_STATUSES = ['scheduled', 'live', 'ended'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface IMeeting extends Document {
  code: string;
  title: string;
  description?: string;
  host: Types.ObjectId;
  invitees: Types.ObjectId[];
  scheduledAt?: Date;
  status: MeetingStatus;
  startedAt?: Date;
  endedAt?: Date;
  settings: {
    muteOnJoin: boolean;
    videoOnJoin: boolean;
    waitingRoom: boolean;
  };
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const meetingSchema = new Schema<IMeeting>(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invitees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    scheduledAt: { type: Date },
    status: {
      type: String,
      enum: MEETING_STATUSES,
      default: 'scheduled',
      index: true,
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    settings: {
      muteOnJoin: { type: Boolean, default: false },
      videoOnJoin: { type: Boolean, default: true },
      waitingRoom: { type: Boolean, default: false },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

meetingSchema.index({ host: 1, status: 1, scheduledAt: -1 });
meetingSchema.index({ invitees: 1, status: 1 });

export const Meeting = mongoose.model<IMeeting>('Meeting', meetingSchema);

export function generateMeetingCode(): string {
  // 3 letters + 3 digits, easy to read aloud (Google Meet–style)
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += letters[crypto.randomInt(letters.length)];
  for (let i = 0; i < 3; i++) code += digits[crypto.randomInt(digits.length)];
  return code;
}
