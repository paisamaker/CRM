import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  MessageSquare,
  Hand,
  Copy,
  Users,
  Smile,
  Send,
  Shield,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useMeetingRtc } from './hooks/useMeetingRtc';
import type { MeetingItem } from './types';
import './meetings.css';

function VideoTile({
  stream,
  muted,
  mirror,
  label,
  videoOff,
  handRaised,
  screenSharing,
  self,
}: {
  stream?: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  label: string;
  videoOff?: boolean;
  handRaised?: boolean;
  screenSharing?: boolean;
  self?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
    } else {
      el.srcObject = null;
    }
    return () => {
      if (el.srcObject) el.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={cn('meet-tile', self && 'meet-tile-self')}>
      {!videoOff && stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted || self}
          className={cn('meet-video', mirror && 'meet-video-mirror')}
        />
      ) : (
        <div className="meet-tile-avatar">
          <UserAvatar name={label} className="h-16 w-16 text-lg" />
        </div>
      )}
      <div className="meet-tile-meta">
        <span>{label}{self ? ' (You)' : ''}</span>
        {handRaised ? <span title="Hand raised">✋</span> : null}
        {screenSharing ? <span title="Sharing screen">🖥️</span> : null}
      </div>
    </div>
  );
}

export function MeetingRoomPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const endedBySelfRef = useRef(false);

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', code],
    queryFn: async () => (await api.get(`/meetings/${code}`)).data.data as MeetingItem,
    enabled: !!code,
  });

  const meetingId = meeting?._id || '';
  const isHost =
    !!user &&
    !!meeting &&
    String(typeof meeting.host === 'object' ? meeting.host._id : meeting.host) === user.id;

  const goMeetingsList = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['meetings'] });
    navigate('/meetings');
  }, [navigate, qc]);

  const rtcRef = useRef<{ leave: () => void } | null>(null);

  const endMeeting = useMutation({
    mutationFn: async () => {
      endedBySelfRef.current = true;
      return (await api.post(`/meetings/${meetingId}/end`)).data;
    },
    onSuccess: () => {
      // Release cam/mic/screen immediately so the browser indicator turns off.
      rtcRef.current?.leave();
      toast.success('Meeting ended and removed');
      goMeetingsList();
    },
    onError: (e) => {
      endedBySelfRef.current = false;
      toast.error(getErrorMessage(e));
    },
  });

  const rtc = useMeetingRtc({
    meetingId,
    userId: user?.id || '',
    userName: user?.name || 'You',
    muteOnJoin: meeting?.settings?.muteOnJoin,
    videoOnJoin: meeting?.settings?.videoOnJoin !== false,
    enabled: ready && !!meetingId && !!user?.id,
    onMeetingEnded: () => {
      if (endedBySelfRef.current) return;
      toast.message('Host ended the meeting');
      goMeetingsList();
    },
  });
  rtcRef.current = rtc;

  useEffect(() => {
    if (rtc.error) toast.error(rtc.error);
  }, [rtc.error]);

  const tiles = useMemo(() => {
    const list = [
      {
        key: 'local',
        stream: rtc.localStream,
        label: user?.name || 'You',
        videoOff: rtc.videoOff,
        handRaised: rtc.handRaised,
        screenSharing: rtc.screenSharing,
        self: true,
      },
      ...rtc.peers.map((p) => ({
        key: p.userId,
        stream: p.stream || null,
        label: p.name,
        videoOff: p.videoOff,
        handRaised: p.handRaised,
        screenSharing: p.screenSharing,
        self: false,
      })),
    ];
    return list;
  }, [rtc.localStream, rtc.peers, rtc.videoOff, rtc.handRaised, rtc.screenSharing, user?.name]);

  const leave = () => {
    rtc.leave();
    navigate('/meetings');
  };

  if (isLoading) {
    return (
      <div className="meet-room meet-room-loading">
        <div className="text-sm text-white/80">Loading meeting…</div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="meet-room meet-room-loading">
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-800">
          Meeting not found or you don’t have access.
          <div className="mt-4">
            <Button onClick={() => navigate('/meetings')}>Back to Meetings</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="meet-room meet-room-loading">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="text-xs font-medium text-slate-500">Ready to join</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{meeting.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Code <span className="font-mono font-bold">{meeting.code}</span>
            {meeting.status === 'live' ? ' · Live now' : ''}
          </p>
          <ul className="mt-4 space-y-1 text-xs text-slate-600">
            <li>• Camera & microphone access will be requested</li>
            <li>• Invite others with the meeting link or code</li>
            <li>• Use mute, camera, screen share, chat, and hand raise in-call</li>
          </ul>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/meetings')}>
              Cancel
            </Button>
            <Button className="flex-1 gap-1.5" onClick={() => setReady(true)}>
              <Video className="h-3.5 w-3.5" /> Join now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="meet-room">
      <header className="meet-room-header">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{meeting.title}</div>
          <div className="text-[11px] text-white/70">
            {meeting.code} · {tiles.length} in call
            {rtc.joined ? '' : ' · Connecting…'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-white/20 bg-white/10 text-xs text-white hover:bg-white/20"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/meetings/room/${meeting.code}`);
              toast.success('Invite link copied');
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
          {isHost ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-300/40 bg-rose-500/20 text-xs text-rose-100 hover:bg-rose-500/30"
              disabled={endMeeting.isPending}
              onClick={() => endMeeting.mutate()}
            >
              <Shield className="h-3.5 w-3.5" /> End for all
            </Button>
          ) : null}
        </div>
      </header>

      <div className="meet-room-body">
        <div className={cn('meet-grid', `meet-grid-${Math.min(tiles.length, 6)}`)}>
          {tiles.map((t) => (
            <VideoTile
              key={t.key}
              stream={t.stream}
              label={t.label}
              videoOff={t.videoOff}
              handRaised={t.handRaised}
              screenSharing={t.screenSharing}
              self={t.self}
              mirror={t.self && !t.screenSharing}
            />
          ))}
        </div>

        {chatOpen ? (
          <aside className="meet-chat">
            <div className="meet-chat-head">
              <MessageSquare className="h-4 w-4" /> In-call messages
            </div>
            <div className="meet-chat-list">
              {rtc.chat.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-white/50">No messages yet</div>
              ) : (
                rtc.chat.map((m) => (
                  <div key={m.id} className="meet-chat-item">
                    <div className="text-[10px] font-semibold text-teal-200">{m.name}</div>
                    <div className="text-xs text-white/90">{m.body}</div>
                  </div>
                ))
              )}
            </div>
            <form
              className="meet-chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatDraft.trim()) return;
                rtc.sendChat(chatDraft.trim());
                setChatDraft('');
              }}
            >
              <Input
                className="h-9 border-white/10 bg-white/10 text-xs text-white placeholder:text-white/40"
                placeholder="Send a message…"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </aside>
        ) : null}
      </div>

      {rtc.reactions.length > 0 ? (
        <div className="meet-reactions">
          {rtc.reactions.map((r) => (
            <span key={r.id} className="meet-reaction">
              {r.emoji}
            </span>
          ))}
        </div>
      ) : null}

      <footer className="meet-controls">
        <div className="meet-controls-inner">
          <button
            type="button"
            className={cn('meet-ctrl', rtc.muted && 'meet-ctrl-off')}
            onClick={rtc.toggleMute}
            title={rtc.muted ? 'Unmute' : 'Mute'}
          >
            {rtc.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className={cn('meet-ctrl', rtc.videoOff && 'meet-ctrl-off')}
            onClick={rtc.toggleVideo}
            title={rtc.videoOff ? 'Start camera' : 'Stop camera'}
          >
            {rtc.videoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className={cn('meet-ctrl', rtc.screenSharing && 'meet-ctrl-on')}
            onClick={rtc.toggleScreenShare}
            title="Present / screen share"
          >
            <MonitorUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn('meet-ctrl', rtc.handRaised && 'meet-ctrl-on')}
            onClick={rtc.toggleHand}
            title="Raise hand"
          >
            <Hand className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn('meet-ctrl', chatOpen && 'meet-ctrl-on')}
            onClick={() => setChatOpen((v) => !v)}
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              className="meet-ctrl"
              onClick={() => setShowReactions((v) => !v)}
              title="Reactions"
            >
              <Smile className="h-5 w-5" />
            </button>
            {showReactions ? (
              <div className="meet-emoji-picker">
                {['👍', '👏', '❤️', '😂', '🎉', '😮'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="text-xl"
                    onClick={() => {
                      rtc.sendReaction(emoji);
                      setShowReactions(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="meet-ctrl" title="People" onClick={() => setChatOpen(true)}>
            <Users className="h-5 w-5" />
            <span className="meet-ctrl-badge">{tiles.length}</span>
          </button>
          <button type="button" className="meet-ctrl meet-ctrl-leave" onClick={leave} title="Leave call">
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
