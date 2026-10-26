import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  Download,
  SmilePlus,
  Play,
  Pause,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatChatTime, formatFileSize, linkifyText, resolveChatMediaUrl } from '../chatUtils';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  isGroup: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  currentUserId?: string;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onEdit?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onPreviewImage?: (url: string, name: string) => void;
}

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function fileBadgeColor(mime?: string, name?: string) {
  const n = (name || '').toLowerCase();
  const m = mime || '';
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'bg-rose-500';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return 'bg-sky-600';
  if (m.includes('sheet') || m.includes('excel') || n.endsWith('.xls') || n.endsWith('.xlsx'))
    return 'bg-emerald-600';
  if (n.endsWith('.zip') || n.endsWith('.rar')) return 'bg-amber-500';
  return 'bg-slate-500';
}

function VoicePlayer({
  src,
  isMine,
  senderAvatar,
  senderName,
}: {
  src?: string;
  isMine: boolean;
  senderAvatar?: string;
  senderName?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(28);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onMeta = () => setDuration(el.duration || 28);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || !src) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  };

  const mm = Math.floor(duration / 60) || 0;
  const ss = String(Math.floor(duration % 60) || 28).padStart(2, '0');

  return (
    <div className="flex items-center gap-3 py-1">
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1e40af] text-white shadow-sm hover:bg-[#1e3a8a] transition"
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-[160px]">
        <div className="flex h-7 items-center gap-[3px]">
          {[35, 60, 45, 80, 50, 70, 95, 40, 65, 85, 30, 75, 90, 55, 40, 60, 70, 85, 50, 65, 45, 30, 50, 40].map(
            (h, i) => (
              <span
                key={i}
                className={cn(
                  'w-[2.5px] rounded-full transition-colors',
                  i / 24 <= progress ? 'bg-[#1e40af]' : 'bg-slate-300'
                )}
                style={{ height: `${h}%` }}
              />
            )
          )}
        </div>
        <div className="text-[11px] font-medium text-slate-500">
          {mm}:{ss}
        </div>
      </div>

      {!isMine && (
        <UserAvatar
          name={senderName}
          avatar={senderAvatar}
          className="h-8 w-8 rounded-full text-[10px] shrink-0 ring-1 ring-slate-200"
        />
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  isMine,
  isGroup,
  isFirstInGroup,
  isLastInGroup,
  currentUserId,
  onReply,
  onReact,
  onDelete,
  onEdit,
  onJumpToReply,
  onPreviewImage,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timeFormatted = formatChatTime(message.createdAt);
  const isSystem = message.type === 'system';
  const isDeleted = !!message.deletedForEveryone;
  const isPending = message.status === 'pending';
  const isFailed = message.status === 'failed';

  const delivered =
    (message.deliveredTo || []).filter((id) => id !== currentUserId).length > 0 ||
    (message.readBy || []).filter((id) => id !== currentUserId).length > 0;
  const read = (message.readBy || []).filter((id) => id !== currentUserId).length > 0;

  useEffect(() => {
    if (!menuOpen && !reactOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setReactOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setReactOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, reactOpen]);

  if (isSystem) {
    return (
      <div className="my-4 flex justify-center px-2">
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200/80">
          {message.body}
        </span>
      </div>
    );
  }

  const reply = typeof message.replyTo === 'object' && message.replyTo ? message.replyTo : null;
  const radius = isMine
    ? cn('rounded-lg', isFirstInGroup && 'rounded-tr-none sm-chat-tail-out')
    : cn('rounded-lg', isFirstInGroup && 'rounded-tl-none sm-chat-tail-in');

  return (
    <div
      id={`msg-${message._id}`}
      ref={rootRef}
      className={cn(
        'group flex w-full items-end gap-1.5',
        isMine ? 'justify-end' : 'justify-start',
        isFirstInGroup ? 'mt-2.5' : 'mt-0.5'
      )}
    >
      {!isMine && isGroup && (
        <div className="mb-0.5 w-7 shrink-0">
          {isLastInGroup ? (
            <UserAvatar
              name={message.sender?.name}
              avatar={message.sender?.avatar}
              className="h-7 w-7 rounded-full text-[10px]"
            />
          ) : (
            <div className="w-7" />
          )}
        </div>
      )}

      <div
        className={cn(
          'relative flex max-w-[min(100%,32rem)] flex-col sm:max-w-[min(100%,36rem)]',
          isMine ? 'items-end' : 'items-start'
        )}
      >
        {!isMine && isGroup && isFirstInGroup && (
          <span className="mb-0.5 ml-2 text-[11.5px] font-bold text-[#008069]">
            {message.sender?.name || 'Teammate'}
          </span>
        )}

        <div className="relative">
          <div
            className={cn(
              'px-2.5 py-1.5 text-[14px] leading-[19px]',
              isMine ? 'sm-chat-bubble-out' : 'sm-chat-bubble-in',
              radius,
              isPending && 'opacity-70',
              isFailed && '!bg-rose-100 !text-rose-800'
            )}
          >
            {reply && (
              <button
                type="button"
                onClick={() => reply._id && onJumpToReply?.(reply._id)}
                className={cn(
                  'mb-1.5 w-full rounded-md border-l-[3.5px] border-[#00a884] px-2 py-1 text-left text-[11px]',
                  isMine ? 'bg-[#0000000a] text-[#111b21]' : 'bg-[#f0f2f5] text-[#111b21]'
                )}
              >
                <span className="font-bold text-[#00a884]">{reply.sender?.name || 'Message'}</span>
                <p className="truncate opacity-80">
                  {reply.deletedForEveryoneAt ? 'This message was deleted' : reply.body || 'Attachment'}
                </p>
              </button>
            )}

            {isDeleted ? (
              <p className="italic text-[#8696a0] text-xs py-0.5">
                {message.tombstone || 'This message was deleted'}
              </p>
            ) : (
              <>
                {message.attachments?.map((att) => {
                  const src = resolveChatMediaUrl(att.url);
                  if (att.mime?.startsWith('image/')) {
                    return (
                      <button
                        key={att.url}
                        type="button"
                        className="mb-1 block max-w-full overflow-hidden rounded-md cursor-pointer transition hover:opacity-95 text-left"
                        onClick={() => onPreviewImage?.(src, att.name)}
                      >
                        <img
                          src={src}
                          alt={att.name}
                          loading="lazy"
                          className="max-h-72 max-w-full rounded-md object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          style={{ display: 'none' }}
                          className="flex items-center gap-2 rounded-lg bg-black/5 p-2 text-xs text-slate-700"
                        >
                          <ImageIcon className="h-4 w-4 text-teal-600 shrink-0" />
                          <span className="truncate flex-1 font-medium">{att.name}</span>
                          <span className="text-[10px] text-slate-400">Click to view</span>
                        </div>
                      </button>
                    );
                  }
                  if (att.mime?.startsWith('video/')) {
                    return (
                      <video
                        key={att.url}
                        src={src}
                        controls
                        className="mb-1 max-h-72 w-full rounded-md"
                      />
                    );
                  }
                  if (att.mime?.startsWith('audio/')) {
                    return (
                      <VoicePlayer
                        key={att.url}
                        src={src}
                        isMine={isMine}
                        senderAvatar={message.sender?.avatar}
                        senderName={message.sender?.name}
                      />
                    );
                  }
                  return (
                    <a
                      key={att.url}
                      href={`${src}${src.includes('?') ? '&' : '?'}download=1`}
                      className={cn(
                        'mb-1 flex min-w-[210px] items-center gap-2.5 rounded-lg p-2 text-xs transition',
                        isMine
                          ? 'bg-[#00000008] hover:bg-[#00000010]'
                          : 'bg-[#f0f2f5] hover:bg-[#e9edef]'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-black text-white shadow-2xs',
                          fileBadgeColor(att.mime, att.name)
                        )}
                      >
                        {(att.name.split('.').pop() || 'PDF').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#111b21]">{att.name}</p>
                        <p className="text-[10px] text-[#667781]">{formatFileSize(att.size)} • {(att.name.split('.').pop() || 'PDF').toUpperCase()}</p>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-[#8696a0]" />
                    </a>
                  );
                })}

                {message.body && (
                  <span className="whitespace-pre-wrap break-words inline leading-[19px] text-[#111b21]">
                    {linkifyText(message.body).map((part, i) =>
                      part.type === 'link' ? (
                        <a
                          key={i}
                          href={part.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#00a884] underline underline-offset-2 hover:text-[#008069]"
                        >
                          {part.value}
                        </a>
                      ) : (
                        <span key={i}>{part.value}</span>
                      )
                    )}
                  </span>
                )}
              </>
            )}

            {/* WhatsApp Inline Floating Timestamp & Checks */}
            <span
              className="float-right ml-2.5 -mb-0.5 mt-1 inline-flex items-center gap-1 select-none text-[11px] leading-none text-[#667781]"
            >
              {message.editedAt && <span className="italic text-[10px]">edited</span>}
              <span>{timeFormatted}</span>
              {isMine && !isPending && !isFailed && (
                read ? (
                  <CheckCheck
                    className="h-3.5 w-3.5 shrink-0 text-[#53bdeb]"
                    strokeWidth={2.5}
                    aria-label="Read"
                  />
                ) : delivered ? (
                  <CheckCheck
                    className="h-3.5 w-3.5 shrink-0 text-[#8696a0]"
                    strokeWidth={2.5}
                    aria-label="Delivered"
                  />
                ) : (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-[#8696a0]"
                    strokeWidth={2.5}
                    aria-label="Sent"
                  />
                )
              )}
              {isFailed && <span className="font-semibold text-rose-600">Failed</span>}
            </span>
          </div>

          {!isDeleted && (
            <div
              className={cn(
                'absolute top-0 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 opacity-0 shadow-md transition group-hover:opacity-100 group-focus-within:opacity-100',
                isMine ? 'right-full mr-1.5' : 'left-full ml-1.5'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setReactOpen((p) => !p);
                  setMenuOpen(false);
                }}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Add reaction"
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onReply?.(message)}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Reply"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((p) => !p);
                  setReactOpen(false);
                }}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="More"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {reactOpen && (
            <div
              className={cn(
                'absolute z-20 mt-1 flex gap-0.5 rounded-full border border-slate-200 bg-white p-1 shadow-lg',
                isMine ? 'right-0' : 'left-0'
              )}
            >
              {REACT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-full px-1.5 py-0.5 text-sm hover:bg-slate-100"
                  onClick={() => {
                    onReact?.(message._id, emoji);
                    setReactOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {menuOpen && (
            <div
              role="menu"
              className={cn(
                'absolute z-20 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg',
                isMine ? 'right-0' : 'left-0'
              )}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  void navigator.clipboard.writeText(message.body || '');
                  setMenuOpen(false);
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
              {isMine && message.type === 'text' && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    onEdit?.(message);
                    setMenuOpen(false);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onDelete?.(message._id, 'me');
                  setMenuOpen(false);
                }}
              >
                <Trash2 className="h-3 w-3" /> Delete for me
              </button>
              {isMine && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    if (window.confirm('Delete this message for everyone?')) {
                      onDelete?.(message._id, 'everyone');
                    }
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>

        {!!message.reactions?.length && (
          <div className={cn('mt-1 flex flex-wrap gap-1', isMine ? 'justify-end' : 'justify-start')}>
            {message.reactions.map((r) =>
              r.users?.length ? (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact?.(message._id, r.emoji)}
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] shadow-sm',
                    r.users.map(String).includes(String(currentUserId))
                      ? 'border-teal-300 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{r.users.length}</span>
                </button>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
