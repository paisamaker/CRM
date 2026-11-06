export type MeetingPerson = {
  _id: string;
  name: string;
  email?: string;
  role?: string;
  department?: string;
  designation?: string;
  avatar?: string;
  online?: boolean;
};

export type MeetingStatus = 'scheduled' | 'live' | 'ended';

export type MeetingItem = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  host: MeetingPerson | string;
  invitees: MeetingPerson[];
  scheduledAt?: string;
  status: MeetingStatus;
  startedAt?: string;
  endedAt?: string;
  settings?: {
    muteOnJoin?: boolean;
    videoOnJoin?: boolean;
    waitingRoom?: boolean;
  };
  createdAt?: string;
};

export type MeetingChatMessage = {
  id: string;
  userId: string;
  name: string;
  body: string;
  at: string;
};

export type PeerState = {
  userId: string;
  name: string;
  avatar?: string;
  muted: boolean;
  videoOff: boolean;
  handRaised: boolean;
  screenSharing: boolean;
  stream?: MediaStream;
};
