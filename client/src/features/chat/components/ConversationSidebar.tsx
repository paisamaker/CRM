import { useMemo, useState } from 'react';
import {
  Search,
  Users,
  MessageSquare,
  X,
  Filter,
  Pin,
  BellOff,
  Archive,
  SquarePen,
  Pencil,
} from 'lucide-react';
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
  onlineIds?: Set<string>;
  typingByConversation?: Record<string, string[]>;
  filter?: ConversationFilter;
  onFilterChange?: (f: ConversationFilter) => void;
}

const FILTERS: Array<{ key: ConversationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'groups', label: 'Groups' },
  { key: 'direct', label: 'Direct' },
  { key: 'archived', label: 'Archived' },
];

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewGroup,
  onOpenDirectory,
  currentUserId,
  isLoading,
  onlineIds,
  typingByConversation,
  filter: controlledFilter,
  onFilterChange,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState<ConversationFilter>('all');
  const filter = controlledFilter ?? localFilter;
  const setFilter = (f: ConversationFilter) => {
    setLocalFilter(f);
    onFilterChange?.(f);
  };

  const filteredConversations = useMemo(() => {
    let list = [...conversations];
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
    if (filter === 'unread') list = list.filter((c) => (c.unread || 0) > 0);
    else if (filter === 'groups') list = list.filter((c) => c.type === 'group');
    else if (filter === 'direct') list = list.filter((c) => c.type === 'direct');
    else if (filter === 'archived') list = list.filter((c) => c.archived);
    return list;
  }, [conversations, search, filter, currentUserId]);

  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread || 0), 0),
    [conversations]
  );

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-slate-200 bg-white sm:w-[320px] lg:w-[335px]">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900">Messages</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {conversations.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenDirectory}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Compose"
            title="Compose"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenDirectory}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00a389] px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-[#008770]"
            aria-label="New chat"
          >
            <SquarePen className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="chat-conv-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div
          className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            const count = key === 'unread' ? totalUnread : 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs transition font-medium',
                  active
                    ? 'bg-[#00a389] font-semibold text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                {label}
                {key === 'unread' && count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1 text-[10px] font-bold',
                      active ? 'bg-white/25 text-white' : 'bg-teal-600 text-white'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
                <div className="h-11 w-11 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 rounded bg-slate-200" />
                  <div className="h-3 w-40 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length > 0 ? (
          <ul className="p-1 space-y-0.5">
            {filteredConversations.map((c) => {
              const isGroup = c.type === 'group';
              const peer = isGroup
                ? null
                : c.members.find((m) => m._id !== currentUserId) || c.members[0];
              const title = isGroup ? c.name : peer?.name || 'Direct Chat';
              const isActive = activeId === c._id;
              const hasUnread = (c.unread || 0) > 0;
              const timeLabel = formatConversationTimestamp(c.lastMessageAt || c.updatedAt);
              const peerOnline = !!(peer && (onlineIds?.has(peer._id) || (peer as any).online));
              const isTyping = (typingByConversation?.[c._id] || []).length > 0;

              return (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c._id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                      isActive
                        ? 'bg-[#e6f7f3] text-slate-900 shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-700'
                    )}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <div className="relative shrink-0">
                      {isGroup ? (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1e40af]/10 text-[#1e40af]">
                          <Users className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="relative">
                          <UserAvatar
                            name={peer?.name}
                            avatar={peer?.avatar}
                            className="h-11 w-11 rounded-full object-cover text-sm"
                          />
                          {peerOnline && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {c.pinned && <Pin className="h-3 w-3 shrink-0 text-teal-600" />}
                          <span className="truncate text-[13px] font-bold text-slate-900">
                            {title}
                          </span>
                          {!isGroup && peer?.role && (
                            <span className="shrink-0 rounded bg-blue-50 border border-blue-200/80 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-blue-600">
                              {peer.role}
                            </span>
                          )}
                        </span>
                        {timeLabel && (
                          <span
                            className={cn(
                              'shrink-0 text-[11px]',
                              hasUnread ? 'font-semibold text-slate-500' : 'text-slate-400'
                            )}
                          >
                            {timeLabel}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isTyping ? (
                            <p className="truncate text-xs font-medium text-teal-700">typing…</p>
                          ) : c.draft ? (
                            <p className="truncate text-xs text-slate-500">
                              <span className="font-semibold text-slate-700">Draft: </span>
                              <span className="italic">{c.draft}</span>
                            </p>
                          ) : (
                            <p
                              className={cn(
                                'truncate text-xs leading-snug',
                                hasUnread ? 'font-medium text-slate-700' : 'text-slate-500'
                              )}
                            >
                              {c.lastMessagePreview || (
                                <span className="italic text-slate-400">No messages yet</span>
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {c.draft && <Pencil className="h-3 w-3 text-slate-400" />}
                          {c.muted && <BellOff className="h-3 w-3 text-slate-400" />}
                          {c.archived && <Archive className="h-3 w-3 text-slate-400" />}
                          {hasUnread && (
                            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#00a389] px-1 text-[10px] font-bold text-white shadow-2xs">
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : search.trim() ? (
          <div className="px-6 py-10 text-center">
            <Filter className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No conversations found</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
              className="mt-3 text-xs font-semibold text-teal-700 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">No conversations yet</p>
            <button
              type="button"
              onClick={onOpenDirectory}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              Start a conversation
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
