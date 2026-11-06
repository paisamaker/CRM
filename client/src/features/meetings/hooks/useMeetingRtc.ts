import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSocket, getSocket } from '@/lib/socket';
import type { MeetingChatMessage, PeerState } from '../types';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type Options = {
  meetingId: string;
  userId: string;
  userName: string;
  muteOnJoin?: boolean;
  videoOnJoin?: boolean;
  enabled: boolean;
  /** Fired when the host ends (and deletes) the meeting */
  onMeetingEnded?: () => void;
};

export function useMeetingRtc({
  meetingId,
  userId,
  userName,
  muteOnJoin = false,
  videoOnJoin = true,
  enabled,
  onMeetingEnded,
}: Options) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [muted, setMuted] = useState(!!muteOnJoin);
  const [videoOff, setVideoOff] = useState(!videoOnJoin);
  const [handRaised, setHandRaised] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [chat, setChat] = useState<MeetingChatMessage[]>([]);
  const [reactions, setReactions] = useState<Array<{ id: string; userId: string; emoji: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Record<string, PeerState>>({});
  const cleanedUpRef = useRef(false);
  const onMeetingEndedRef = useRef(onMeetingEnded);
  onMeetingEndedRef.current = onMeetingEnded;

  const stopTrack = (track?: MediaStreamTrack | null) => {
    if (!track) return;
    try {
      track.onended = null;
      if (track.readyState !== 'ended') track.stop();
    } catch {
      /* already stopped */
    }
  };

  const stopStreamTracks = (stream?: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      stopTrack(t);
      try {
        stream.removeTrack(t);
      } catch {
        /* ignore */
      }
    });
  };

  /** Fully release cam/mic/screen + peer connections so the browser indicator turns off. */
  const releaseMedia = useCallback((opts?: { emitLeave?: boolean }) => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    if (opts?.emitLeave && meetingId) {
      try {
        getSocket().emit('meet:leave', { meetingId });
      } catch {
        /* socket may already be gone */
      }
    }

    pcs.current.forEach((pc) => {
      try {
        pc.getSenders().forEach((sender) => {
          try {
            void sender.replaceTrack(null);
          } catch {
            /* ignore */
          }
        });
        pc.getReceivers().forEach((receiver) => stopTrack(receiver.track));
        pc.close();
      } catch {
        /* ignore */
      }
    });
    pcs.current.clear();

    stopStreamTracks(localStreamRef.current);
    localStreamRef.current = null;

    // Camera may still be live while screen-sharing (held off-stream for restore).
    stopTrack(cameraTrackRef.current);
    cameraTrackRef.current = null;
    stopTrack(screenTrackRef.current);
    screenTrackRef.current = null;

    Object.values(peersRef.current).forEach((p) => stopStreamTracks(p.stream || null));
    peersRef.current = {};

    setLocalStream(null);
    setPeers({});
    setJoined(false);
    setScreenSharing(false);
    setHandRaised(false);
  }, [meetingId]);

  const upsertPeer = useCallback((partial: Partial<PeerState> & { userId: string }) => {
    setPeers((prev) => {
      const next = {
        ...prev,
        [partial.userId]: {
          userId: partial.userId,
          name: partial.name || prev[partial.userId]?.name || 'Guest',
          avatar: partial.avatar ?? prev[partial.userId]?.avatar,
          muted: partial.muted ?? prev[partial.userId]?.muted ?? false,
          videoOff: partial.videoOff ?? prev[partial.userId]?.videoOff ?? false,
          handRaised: partial.handRaised ?? prev[partial.userId]?.handRaised ?? false,
          screenSharing: partial.screenSharing ?? prev[partial.userId]?.screenSharing ?? false,
          stream: partial.stream ?? prev[partial.userId]?.stream,
        },
      };
      peersRef.current = next;
      return next;
    });
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const pc = pcs.current.get(peerId);
    if (pc) {
      try {
        pc.getReceivers().forEach((r) => stopTrack(r.track));
        pc.close();
      } catch {
        /* ignore */
      }
      pcs.current.delete(peerId);
    }
    setPeers((prev) => {
      const leaving = prev[peerId];
      stopStreamTracks(leaving?.stream || null);
      const next = { ...prev };
      delete next[peerId];
      peersRef.current = next;
      return next;
    });
  }, []);

  const ensurePc = useCallback(
    (peerId: string) => {
      let pc = pcs.current.get(peerId);
      if (pc) return pc;

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.current.set(peerId, pc);

      const stream = localStreamRef.current;
      stream?.getTracks().forEach((track) => pc!.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        getSocket().emit('meet:signal', {
          meetingId,
          to: peerId,
          data: { type: 'ice', candidate: ev.candidate },
        });
      };

      pc.ontrack = (ev) => {
        const remote = ev.streams[0] || new MediaStream([ev.track]);
        upsertPeer({ userId: peerId, stream: remote });
      };

      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
          removePeer(peerId);
        }
      };

      return pc;
    },
    [meetingId, removePeer, upsertPeer]
  );

  const createOfferTo = useCallback(
    async (peerId: string) => {
      const pc = ensurePc(peerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      getSocket().emit('meet:signal', {
        meetingId,
        to: peerId,
        data: { type: 'offer', sdp: offer },
      });
    },
    [ensurePc, meetingId]
  );

  const broadcastState = useCallback(
    (patch: {
      muted?: boolean;
      videoOff?: boolean;
      handRaised?: boolean;
      screenSharing?: boolean;
    }) => {
      getSocket().emit('meet:state', { meetingId, ...patch });
    },
    [meetingId]
  );

  useEffect(() => {
    if (!enabled || !meetingId || !userId) return;
    let cancelled = false;
    cleanedUpRef.current = false;

    async function boot() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: videoOnJoin
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
        if (cancelled || cleanedUpRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        stream.getAudioTracks().forEach((t) => {
          t.enabled = !muteOnJoin;
        });
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMuted(!!muteOnJoin);
        setVideoOff(!stream.getVideoTracks().length || !videoOnJoin);

        const s = connectSocket();

        const onSignal = async (payload: { from: string; data: any }) => {
          const from = payload.from;
          const data = payload.data;
          if (!from || from === userId) return;
          const pc = ensurePc(from);

          if (data.type === 'offer') {
            await pc.setRemoteDescription(data.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            getSocket().emit('meet:signal', {
              meetingId,
              to: from,
              data: { type: 'answer', sdp: answer },
            });
          } else if (data.type === 'answer') {
            if (pc.signalingState !== 'stable') {
              await pc.setRemoteDescription(data.sdp);
            }
          } else if (data.type === 'ice' && data.candidate) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch {
              /* ignore late candidates */
            }
          }
        };

        const onPeerJoined = (peer: PeerState) => {
          if (peer.userId === userId) return;
          upsertPeer(peer);
          // Existing peers wait; new joiner initiates offers (handled in join ack for us)
        };

        const onPeerLeft = ({ userId: leftId }: { userId: string }) => removePeer(leftId);

        const onPeerState = (st: PeerState) => {
          if (st.userId === userId) return;
          upsertPeer(st);
        };

        const onChat = (msg: MeetingChatMessage) => setChat((c) => [...c.slice(-199), msg]);

        const onReaction = (r: { userId: string; emoji: string; at: string }) => {
          const id = `${r.at}-${r.userId}-${r.emoji}`;
          setReactions((prev) => [...prev.slice(-20), { id, userId: r.userId, emoji: r.emoji }]);
          setTimeout(() => {
            setReactions((prev) => prev.filter((x) => x.id !== id));
          }, 2500);
        };

        const onEnded = (payload?: { meetingId?: string }) => {
          if (payload?.meetingId && payload.meetingId !== meetingId) return;
          releaseMedia({ emitLeave: false });
          onMeetingEndedRef.current?.();
        };

        s.on('meet:signal', onSignal);
        s.on('meet:peer-joined', onPeerJoined);
        s.on('meet:peer-left', onPeerLeft);
        s.on('meet:peer-state', onPeerState);
        s.on('meet:chat', onChat);
        s.on('meet:reaction', onReaction);
        s.on('meet:ended', onEnded);

        s.emit(
          'meet:join',
          { meetingId },
          async (ack?: { ok: boolean; error?: string; peers?: PeerState[] }) => {
            if (cancelled || cleanedUpRef.current) {
              stopStreamTracks(stream);
              return;
            }
            if (!ack?.ok) {
              stopStreamTracks(stream);
              localStreamRef.current = null;
              cameraTrackRef.current = null;
              setLocalStream(null);
              setError(ack?.error || 'Could not join meeting');
              return;
            }
            setJoined(true);
            for (const peer of ack.peers || []) {
              upsertPeer(peer);
              await createOfferTo(peer.userId);
            }
            broadcastState({
              muted: !!muteOnJoin,
              videoOff: !stream.getVideoTracks().length || !videoOnJoin,
              handRaised: false,
              screenSharing: false,
            });
          }
        );

        return () => {
          s.off('meet:signal', onSignal);
          s.off('meet:peer-joined', onPeerJoined);
          s.off('meet:peer-left', onPeerLeft);
          s.off('meet:peer-state', onPeerState);
          s.off('meet:chat', onChat);
          s.off('meet:reaction', onReaction);
          s.off('meet:ended', onEnded);
        };
      } catch (e: any) {
        setError(e?.message || 'Camera / microphone permission denied');
      }
    }

    let cleanupSocket: (() => void) | undefined;
    boot().then((fn) => {
      cleanupSocket = fn;
    });

    return () => {
      cancelled = true;
      cleanupSocket?.();
      releaseMedia({ emitLeave: true });
    };
    // intentionally only on meeting join lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, meetingId, userId, releaseMedia]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
    broadcastState({ muted: next });
  };

  const toggleVideo = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (!videoOff) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
        stream.removeTrack(t);
      });
      cameraTrackRef.current = null;
      setVideoOff(true);
      broadcastState({ videoOff: true });
      // replace with blank for remotes
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        sender?.replaceTrack(null);
      });
      setLocalStream(new MediaStream(stream.getTracks()));
      return;
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      const track = cam.getVideoTracks()[0];
      cameraTrackRef.current = track;
      stream.addTrack(track);
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video' || !s.track);
        if (sender) sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      });
      setLocalStream(new MediaStream(stream.getTracks()));
      setVideoOff(false);
      setScreenSharing(false);
      broadcastState({ videoOff: false, screenSharing: false });
    } catch {
      setError('Could not enable camera');
    }
  };

  const toggleScreenShare = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (screenSharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      const cam = cameraTrackRef.current;
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video' || !s.track);
        sender?.replaceTrack(cam);
      });
      if (cam && !stream.getVideoTracks().includes(cam)) stream.addTrack(cam);
      setScreenSharing(false);
      setVideoOff(!cam);
      broadcastState({ screenSharing: false, videoOff: !cam });
      setLocalStream(new MediaStream(stream.getTracks()));
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      screenTrackRef.current = track;
      track.onended = () => {
        void toggleScreenShare();
      };
      stream.getVideoTracks().forEach((t) => {
        if (t !== track) {
          stream.removeTrack(t);
          // keep cameraTrackRef for restore
        }
      });
      stream.addTrack(track);
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video' || !s.track);
        if (sender) sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      });
      setScreenSharing(true);
      setVideoOff(false);
      broadcastState({ screenSharing: true, videoOff: false });
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch {
      /* user cancelled */
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    broadcastState({ handRaised: next });
  };

  const sendChat = (body: string) => {
    getSocket().emit('meet:chat', { meetingId, body });
  };

  const sendReaction = (emoji: string) => {
    getSocket().emit('meet:reaction', { meetingId, emoji });
  };

  const leave = () => {
    releaseMedia({ emitLeave: true });
  };

  return {
    localStream,
    peers: Object.values(peers),
    muted,
    videoOff,
    handRaised,
    screenSharing,
    chat,
    reactions,
    error,
    joined,
    userName,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleHand,
    sendChat,
    sendReaction,
    leave,
    releaseMedia,
  };
}
