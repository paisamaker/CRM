import { useState, useMemo } from 'react';
import { Search, Plus, Users, MessageSquare, X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatConversationTimestamp } from '../chatUtils';
import type { Conversation, ConversationFilter } from '../types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewGroup: () => void;
  onOpenDirectory: () => void;
  currentUserId?: string;
  isLoading?: boolean;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewGroup,
  onOpenDirectory,
  currentUserId,
  isLoading,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');

  const filteredConversations = useMemo(() => {
    let list = [...conversations];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => {
        if (c.type === 'group') {
          return (
            (c.name || '').toLowerCase().includes(q) ||
            (c.lastMessagePreview || '').toLowerCase().includes(q)
          );
        }
        const peer = c.members.find((m) => m._id !== currentUserId);
        return (
          (peer?.name || '').toLowerCase().includes(q) ||
          (peer?.email || '').toLowerCase().includes(q) ||
          (c.lastMessagePreview || '').toLowerCase().includes(q)
        );
      });
    }

    // Tab filter
    if (filter === 'unread') {
      list = list.filter((c) => (c.unread || 0) > 0);
    } else if (filter === 'groups') {
      list = list.filter((c) => c.type === 'group');
    } else if (filter === 'direct') {
      list = list.filter((c) => c.type === 'direct');
    }

    return list;
  }, [conversations, search, filter, currentUserId]);

  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread || 0), 0),
    [conversations]
  );

  return (
    <aside className="flex h-full w-full flex-col border-r border-[#E4E7EC] bg-white sm:w-[300px] lg:w-[320px] shrink-0">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#E4E7EC] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-[#182230] tracking-tight">Messages</h2>
          {conversations.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {conversations.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenDirectory}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            title="Start new direct message"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={onNewGroup}
            className="flex h-8 items-center gap-1 rounded-lg bg-[#0D9488] px-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0B7D72]"
            title="Create group conversation"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Group</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="border-b border-[#E4E7EC] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-1.5 pl-8 pr-8 text-xs text-[#182230] placeholder-slate-400 transition focus:border-[#0D9488] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5 text-xs scrollbar-none">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              filter === 'all'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              filter === 'unread'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <span>Unread</span>
            {totalUnread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0D9488] px-1 text-[9px] font-bold text-white">
                {totalUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter('groups')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              filter === 'groups'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            Groups
          </button>
          <button
            type="button"
            onClick={() => setFilter('direct')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              filter === 'direct'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            Direct
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
        {isLoading ? (
          <div className="space-y-3 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-slate-200" />
                  <div className="h-3 w-40 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((c) => {
            const isGroup = c.type === 'group';
            const peer = isGroup
              ? null
              : c.members.find((m) => m._id !== currentUserId) || c.members[0];

            const title = isGroup ? c.name : peer?.name || 'Direct Chat';
            const isActive = activeId === c._id;
            const hasUnread = (c.unread || 0) > 0;
            const timeLabel = formatConversationTimestamp(c.lastMessageAt || c.updatedAt);

            return (
              <button
                key={c._id}
                type="button"
                onClick={() => onSelect(c._id)}
                className={cn(
                  'group relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-all',
                  isActive
                    ? 'bg-[#E8F7F4]/80 text-[#182230] border-l-[3px] border-[#0D9488]'
                    : 'border-l-[3px] border-transparent hover:bg-slate-50/90 text-slate-700'
                )}
              >
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

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        'truncate text-[13px] font-semibold',
                        isActive ? 'text-[#182230]' : 'text-slate-800'
                      )}
                    >
                      {title}
                    </span>
                    {timeLabel && (
                      <span
                        className={cn(
                          'shrink-0 text-[10.5px]',
                          hasUnread ? 'font-semibold text-[#0D9488]' : 'text-slate-400'
                        )}
                      >
                        {timeLabel}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'truncate text-xs',
                        hasUnread ? 'font-medium text-slate-800' : 'text-slate-500'
                      )}
                    >
                      {c.lastMessagePreview || (
                        <span className="italic text-slate-400">No messages yet</span>
                      )}
                    </p>
                    {hasUnread && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#0D9488] px-1 text-[10px] font-bold text-white shadow-2xs">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        ) : search.trim() ? (
          <div className="p-6 text-center">
            <Filter className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">No conversations found</p>
            <p className="mt-1 text-[11px] text-slate-500">
              No chat matches &quot;{search}&quot;. Try a different term or clear filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
              className="mt-3 text-xs font-medium text-[#0D9488] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="mt-2.5 text-xs font-semibold text-slate-700">No conversations yet</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Start collaborating with teammates or create a group channel.
            </p>
            <button
              type="button"
              onClick={onOpenDirectory}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
            >
              <Plus className="h-3 w-3" />
              <span>Start a conversation</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
