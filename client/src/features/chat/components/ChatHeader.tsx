import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  PanelRight,
  Pin,
  BellOff,
  Bell,
  Archive,
  MoreVertical,
  Trash2,
  Search,
  Phone,
  Video,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import type { Conversation } from '../types';

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  peerOnline?: boolean;
  typingLabel?: string;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onToggleArchive?: () => void;
  onHide?: () => void;
  onSearchMessages?: () => void;
}

export function ChatHeader({
  conversation,
  currentUserId,
  onBack,
  detailsOpen,
  onToggleDetails,
  peerOnline,
  typingLabel,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onHide,
  onSearchMessages,
}: ChatHeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isGroup = conversation.type === 'group';
  const peer = isGroup
    ? null
    : conversation.members.find((m) => m._id !== currentUserId) || conversation.members[0];

  const title = isGroup ? conversation.name : peer?.name || 'Direct Chat';
  const statusLine = typingLabel
    ? typingLabel
    : isGroup
      ? `${conversation.members.length} members`
      : peerOnline
        ? 'online'
        : 'tap here for contact info';

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="sm-chat-header sticky top-0 z-10 flex h-[56px] shrink-0 items-center justify-between gap-1 border-b border-transparent bg-[#008069] px-1.5 text-white md:h-[60px] md:gap-2 md:border-[#e9edef] md:bg-[#f0f2f5] md:px-4 md:text-[#111b21]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/15 md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDetails}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:active:bg-black/5 md:focus-visible:ring-[#00a884]/40"
          aria-label="Open contact details"
        >
          <span className="relative shrink-0">
            {isGroup ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white md:bg-[#dfe5e7] md:text-[#54656f]">
                <Users className="h-5 w-5" />
              </div>
            ) : (
              <UserAvatar
                name={peer?.name}
                avatar={peer?.avatar}
                className="h-10 w-10 rounded-full text-xs"
              />
            )}
            {!isGroup && peerOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#008069] bg-[#25d366] md:border-[#f0f2f5]" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[16px] font-medium leading-tight text-white md:text-[#111b21]">
                {title}
              </span>
              {conversation.pinned && (
                <Pin className="h-3 w-3 shrink-0 text-white/90 md:text-[#00a884]" />
              )}
              {conversation.muted && (
                <BellOff className="h-3 w-3 shrink-0 text-white/75 md:text-[#667781]" />
              )}
            </span>
            <span
              className={cn(
                'block truncate text-[12px] leading-tight',
                typingLabel
                  ? 'text-[#d9fdd3] md:text-[#00a884]'
                  : 'text-white/80 md:text-[#667781]'
              )}
            >
              {statusLine}
            </span>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center">
        {onSearchMessages && (
          <button
            type="button"
            onClick={onSearchMessages}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5 sm:inline-flex"
            aria-label="Search messages"
            title="Search"
          >
            <Search className="h-[22px] w-[22px]" />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/meetings')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/15 md:text-[#54656f] md:hover:bg-black/5"
          aria-label="Voice call"
          title="Open Meetings"
        >
          <Phone className="h-[22px] w-[22px]" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/meetings')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/15 md:text-[#54656f] md:hover:bg-black/5"
          aria-label="Video call"
          title="Start a meeting"
        >
          <Video className="h-[22px] w-[22px]" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/15 md:text-[#54656f] md:hover:bg-black/5"
            aria-label="Conversation options"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-[22px] w-[22px]" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#e9edef] bg-white py-1 text-[14px] shadow-lg"
            >
              {onSearchMessages && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-4 py-3 text-[#111b21] hover:bg-[#f0f2f5] sm:hidden"
                  onClick={() => {
                    onSearchMessages();
                    setMenuOpen(false);
                  }}
                >
                  <Search className="h-4 w-4 text-[#54656f]" />
                  Search
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-[#111b21] hover:bg-[#f0f2f5]"
                onClick={() => {
                  onTogglePin?.();
                  setMenuOpen(false);
                }}
              >
                <Pin className="h-4 w-4 text-[#54656f]" />
                {conversation.pinned ? 'Unpin chat' : 'Pin chat'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-[#111b21] hover:bg-[#f0f2f5]"
                onClick={() => {
                  onToggleMute?.();
                  setMenuOpen(false);
                }}
              >
                {conversation.muted ? (
                  <Bell className="h-4 w-4 text-[#54656f]" />
                ) : (
                  <BellOff className="h-4 w-4 text-[#54656f]" />
                )}
                {conversation.muted ? 'Unmute' : 'Mute notifications'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-[#111b21] hover:bg-[#f0f2f5]"
                onClick={() => {
                  onToggleArchive?.();
                  setMenuOpen(false);
                }}
              >
                <Archive className="h-4 w-4 text-[#54656f]" />
                {conversation.archived ? 'Unarchive' : 'Archive chat'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-[#111b21] hover:bg-[#f0f2f5] lg:hidden"
                onClick={() => {
                  onToggleDetails();
                  setMenuOpen(false);
                }}
              >
                <PanelRight className="h-4 w-4 text-[#54656f]" />
                Contact info
              </button>
              <div className="my-1 border-t border-[#e9edef]" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-3 text-[#ea0038] hover:bg-[#f0f2f5]"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Hide conversation?',
                    description:
                      'This hides the chat from your list. You can still open it again later if needed.',
                    confirmLabel: 'Hide chat',
                    tone: 'warning',
                  });
                  if (ok) onHide?.();
                  setMenuOpen(false);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete for me
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            'ml-0.5 hidden h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-semibold transition lg:inline-flex',
            detailsOpen
              ? 'border-[#00a884]/40 bg-[#e7f8f3] text-[#008069]'
              : 'border-[#e9edef] text-[#54656f] hover:bg-black/5'
          )}
          aria-pressed={detailsOpen}
          title="Details"
        >
          <PanelRight className="h-3.5 w-3.5" />
          Details
        </button>
      </div>
    </header>
  );
}
