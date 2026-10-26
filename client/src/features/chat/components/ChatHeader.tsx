import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Users,
  PanelRight,
  Shield,
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
import { toast } from 'sonner';
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
        ? 'Online'
        : 'Offline';

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
    <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-[#e9edef] bg-[#f0f2f5] px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDetails}
          className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
          aria-label="Open contact details"
        >
          {isGroup ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-100">
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
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            {conversation.pinned && <Pin className="h-3 w-3 shrink-0 text-teal-600" />}
            {conversation.muted && <BellOff className="h-3 w-3 shrink-0 text-slate-400" />}
            {!isGroup && peer?.role && (
              <span className="inline-flex items-center rounded-full border border-blue-400 bg-blue-50/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-600">
                {peer.role}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
            {isGroup ? (
              <span>{conversation.members.length} members</span>
            ) : (
              <>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    peerOnline ? 'text-emerald-600' : 'text-slate-400'
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      peerOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    )}
                  />
                  {peerOnline ? 'Online' : 'Offline'}
                </span>
                {peer?.role && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="capitalize">{peer.role}</span>
                  </>
                )}
                {peer?.email && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-400 truncate">{peer.email}</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onSearchMessages && (
          <button
            type="button"
            onClick={onSearchMessages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            aria-label="Search messages"
            title="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => toast.info('Voice call connected')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          aria-label="Voice call"
          title="Voice call"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => toast.info('Starting video call...')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          aria-label="Video call"
          title="Video call"
        >
          <Video className="h-4 w-4" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Conversation options"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-[12px] shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onTogglePin?.();
                  setMenuOpen(false);
                }}
              >
                <Pin className="h-3.5 w-3.5" />
                {conversation.pinned ? 'Unpin chat' : 'Pin chat'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onToggleMute?.();
                  setMenuOpen(false);
                }}
              >
                {conversation.muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                {conversation.muted ? 'Unmute' : 'Mute notifications'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onToggleArchive?.();
                  setMenuOpen(false);
                }}
              >
                <Archive className="h-3.5 w-3.5" />
                {conversation.archived ? 'Unarchive' : 'Archive chat'}
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  if (window.confirm('Hide this conversation from your list?')) onHide?.();
                  setMenuOpen(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete for me
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            'ml-0.5 inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-semibold transition',
            detailsOpen
              ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          )}
          aria-pressed={detailsOpen}
          title="Details"
        >
          <PanelRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Details</span>
        </button>
      </div>
    </header>
  );
}
