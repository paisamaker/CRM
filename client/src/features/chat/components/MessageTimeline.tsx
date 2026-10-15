import { useEffect, useRef, useState, type UIEvent } from 'react';
import { ArrowDown } from 'lucide-react';
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
}

export function MessageTimeline({
  conversation,
  messages,
  currentUserId,
  onSendStarter,
  isLoading,
}: MessageTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  // Detect user scroll position
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    const isNear = distanceToBottom < 100;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(!isNear && distanceToBottom > 150);
  };

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  // Auto-scroll when new messages arrive (only if already near bottom)
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages]);

  // Initial scroll to bottom on conversation change
  useEffect(() => {
    scrollToBottom('auto');
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  }, [conversation._id]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 lg:p-6 overflow-y-auto">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex items-end gap-2.5 ${i % 2 === 0 ? 'justify-end' : 'justify-start'} animate-pulse`}
          >
            {i % 2 !== 0 && <div className="h-8 w-8 rounded-lg bg-slate-200" />}
            <div
              className={`h-12 rounded-2xl bg-slate-200 ${
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
      <ChatEmptyState
        variant="empty-messages"
        conversation={conversation}
        currentUserId={currentUserId}
        onSendStarter={onSendStarter}
      />
    );
  }

  const isGroup = conversation.type === 'group';

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 sm:px-6 lg:py-6"
      >
        <div className="space-y-1">
          {messages.map((message, index) => {
            const isMine = String(message.sender?._id) === String(currentUserId);
            const prevMessage = messages[index - 1];
            const nextMessage = messages[index + 1];

            // Date separator check
            const showDateSeparator =
              !prevMessage || !isSameDay(prevMessage.createdAt, message.createdAt);

            // Grouping logic (consecutive messages from same sender within 5 mins)
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
                  <div className="my-5 flex items-center justify-center">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[10.5px] font-semibold text-slate-500 shadow-2xs">
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
                />
              </div>
            );
          })}
          <div ref={bottomRef} className="h-2" />
        </div>
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-6 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
          title="Scroll to latest messages"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
