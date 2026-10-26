import { useEffect, useRef, useState, type UIEvent } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { formatDateSeparator, isSameDay } from '../chatUtils';
import { MessageBubble } from './MessageBubble';
import { ChatEmptyState } from './ChatEmptyState';
import type { Conversation, Message } from '../types';

interface MessageTimelineProps {
  conversation: Conversation;
  messages: Message[];
  currentUserId?: string;
  onSendStarter?: (text: string) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  typingUsers?: string[];
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onEdit?: (message: Message) => void;
  onPreviewImage?: (url: string, name: string) => void;
}

export function MessageTimeline({
  conversation,
  messages,
  currentUserId,
  onSendStarter,
  isLoading,
  hasMore,
  loadingMore,
  onLoadMore,
  typingUsers = [],
  onReply,
  onReact,
  onDelete,
  onEdit,
  onPreviewImage,
}: MessageTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const isNearBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const loadingLock = useRef(false);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    const isNear = distanceToBottom < 120;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(!isNear && distanceToBottom > 150);
    if (isNear) setNewBelow(false);

    if (target.scrollTop < 72 && hasMore && !loadingMore && !loadingLock.current) {
      loadingLock.current = true;
      const prevHeight = target.scrollHeight;
      onLoadMore?.();
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop =
            containerRef.current.scrollHeight - prevHeight + containerRef.current.scrollTop;
        }
        loadingLock.current = false;
      });
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setNewBelow(false);
  };

  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      if (isNearBottomRef.current) scrollToBottom('smooth');
      else setNewBelow(true);
    }
    prevLenRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    scrollToBottom('auto');
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setNewBelow(false);
    prevLenRef.current = messages.length;
  }, [conversation._id]);

  if (isLoading) {
    return (
      <div className="sm-chat-messages flex-1 space-y-4 overflow-y-auto p-4 lg:p-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex animate-pulse items-end gap-2 ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
          >
            {i % 2 !== 0 && <div className="h-8 w-8 rounded-full bg-slate-200/80" />}
            <div
              className={`h-11 rounded-2xl bg-white/70 ring-1 ring-slate-200/60 ${
                i % 2 === 0 ? 'w-48 sm:w-64' : 'w-40 sm:w-56'
              }`}
            />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="sm-chat-messages flex flex-1">
        <ChatEmptyState
          variant="empty-messages"
          conversation={conversation}
          currentUserId={currentUserId}
          onSendStarter={onSendStarter}
        />
      </div>
    );
  }

  const isGroup = conversation.type === 'group';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="sm-chat-messages h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 lg:px-8"
      >
        {loadingMore && (
          <div className="mb-3 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" aria-label="Loading older messages" />
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl space-y-0.5 pb-2">
          {messages.map((message, index) => {
            const isMine = String(message.sender?._id) === String(currentUserId);
            const prevMessage = messages[index - 1];
            const nextMessage = messages[index + 1];
            const showDateSeparator =
              !prevMessage || !isSameDay(prevMessage.createdAt, message.createdAt);

            const isFirstInGroup =
              !prevMessage ||
              String(prevMessage.sender?._id) !== String(message.sender?._id) ||
              showDateSeparator ||
              Math.abs(
                new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime()
              ) >
                5 * 60 * 1000;

            const isLastInGroup =
              !nextMessage ||
              String(nextMessage.sender?._id) !== String(message.sender?._id) ||
              !isSameDay(message.createdAt, nextMessage.createdAt) ||
              Math.abs(
                new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()
              ) >
                5 * 60 * 1000;

            return (
              <div key={message._id || message.clientId || index}>
                {showDateSeparator && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="sm-chat-date-pill rounded-lg px-3.5 py-1 text-[12px] font-medium uppercase tracking-wide">
                      {formatDateSeparator(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isMine={isMine}
                  isGroup={isGroup}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  onReact={onReact}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onJumpToReply={(id) => {
                    document
                      .getElementById(`msg-${id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  onPreviewImage={onPreviewImage}
                />
              </div>
            );
          })}
          <div ref={bottomRef} className="h-3" />
        </div>
      </div>

      {typingUsers.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] font-medium text-teal-700 sm:left-6">
          {typingUsers.length === 1 ? 'typing…' : 'several people typing…'}
        </div>
      )}

      {(showScrollBottom || newBelow) && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-slate-700 shadow-md transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 sm:right-6"
          title="Scroll to latest"
          aria-label="Scroll to latest messages"
        >
          <ArrowDown className="h-4 w-4" />
          {newBelow && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-teal-700">New</span>
          )}
        </button>
      )}
    </div>
  );
}
