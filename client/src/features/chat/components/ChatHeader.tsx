import { ArrowLeft, Users, RefreshCw, PanelRight, Shield, Mail, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { Conversation } from '../types';

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

export function ChatHeader({
  conversation,
  currentUserId,
  onBack,
  onRefresh,
  isRefreshing,
  detailsOpen,
  onToggleDetails,
}: ChatHeaderProps) {
  const [copied, setCopied] = useState(false);
  const isGroup = conversation.type === 'group';
  const peer = isGroup
    ? null
    : conversation.members.find((m) => m._id !== currentUserId) || conversation.members[0];

  const title = isGroup ? conversation.name : peer?.name || 'Direct Chat';
  const subtitle = isGroup
    ? `${conversation.members.length} members · STAR MEDIA CRM`
    : peer?.role
      ? `${peer.role.toUpperCase()} · ${peer.email || 'STAR MEDIA'}`
      : 'STAR MEDIA Team Member';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success('Conversation link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E4E7EC] bg-white px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile Back Button */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 md:hidden"
            title="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        {/* Avatar */}
        <div className="relative shrink-0">
          {isGroup ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 border border-teal-200/60 text-teal-700 shadow-2xs">
              <Users className="h-5 w-5" />
            </div>
          ) : (
            <UserAvatar
              name={peer?.name}
              avatar={peer?.avatar}
              className="h-10 w-10 rounded-xl text-xs"
            />
          )}
        </div>

        {/* Title & Metadata */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold text-[#182230] sm:text-base tracking-tight">
              {title}
            </h1>
            {isGroup ? (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 border border-teal-200/60">
                Group
              </span>
            ) : peer?.role ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                <Shield className="h-2.5 w-2.5 text-teal-600" />
                {peer.role}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[#667085]">{subtitle}</p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 sm:flex"
          title="Copy link to conversation"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Share'}</span>
        </button>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            title="Refresh messages"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#0D9488]' : ''}`} />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDetails}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
            detailsOpen
              ? 'border-teal-200 bg-teal-50 text-teal-800 font-semibold'
              : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
          }`}
          title={detailsOpen ? 'Hide conversation details' : 'Show conversation details'}
        >
          <PanelRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{detailsOpen ? 'Details' : 'Details'}</span>
        </button>
      </div>
    </header>
  );
}
