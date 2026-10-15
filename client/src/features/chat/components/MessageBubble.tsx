import { CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatChatTime } from '../chatUtils';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  isGroup: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

export function MessageBubble({
  message,
  isMine,
  isGroup,
  isFirstInGroup,
  isLastInGroup,
}: MessageBubbleProps) {
  const timeFormatted = formatChatTime(message.createdAt);

  return (
    <div
      className={cn(
        'group flex w-full items-end gap-2.5',
        isMine ? 'justify-end' : 'justify-start',
        isFirstInGroup ? 'mt-3.5' : 'mt-1'
      )}
    >
      {/* Incoming Avatar (Only visible for the last message in a sender group) */}
      {!isMine && (
        <div className="w-8 shrink-0">
          {isLastInGroup ? (
            <UserAvatar
              name={message.sender?.name}
              avatar={message.sender?.avatar}
              className="h-8 w-8 rounded-lg text-xs"
            />
          ) : (
            <div className="w-8" />
          )}
        </div>
      )}

      {/* Message Bubble Container */}
      <div
        className={cn(
          'relative flex flex-col',
          isMine ? 'items-end' : 'items-start',
          'max-w-[85%] sm:max-w-[580px]'
        )}
      >
        {/* Sender Name (Only in group chats for the first message of an incoming group) */}
        {!isMine && isGroup && isFirstInGroup && (
          <span className="mb-1 ml-1 text-xs font-semibold text-teal-800">
            {message.sender?.name || 'Teammate'}
          </span>
        )}

        {/* Bubble Surface */}
        <div
          className={cn(
            'px-3.5 py-2.5 text-[13.5px] leading-relaxed transition-all shadow-xs',
            isMine
              ? cn(
                  'bg-[#0D9488] text-white',
                  isFirstInGroup && isLastInGroup && 'rounded-2xl',
                  isFirstInGroup && !isLastInGroup && 'rounded-2xl rounded-br-md',
                  !isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-tr-md',
                  !isFirstInGroup && !isLastInGroup && 'rounded-xl rounded-r-md'
                )
              : cn(
                  'border border-[#E4E7EC] bg-white text-[#182230]',
                  isFirstInGroup && isLastInGroup && 'rounded-2xl',
                  isFirstInGroup && !isLastInGroup && 'rounded-2xl rounded-bl-md',
                  !isFirstInGroup && isLastInGroup && 'rounded-2xl rounded-tl-md',
                  !isFirstInGroup && !isLastInGroup && 'rounded-xl rounded-l-md'
                )
          )}
        >
          <div className="whitespace-pre-wrap break-words">{message.body}</div>

          {/* Footer Metadata */}
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-[10.5px]',
              isMine ? 'justify-end text-teal-100/90' : 'justify-end text-[#667085]'
            )}
          >
            <span>{timeFormatted}</span>
            {isMine && <CheckCheck className="h-3 w-3 text-teal-200" />}
          </div>
        </div>
      </div>
    </div>
  );
}
