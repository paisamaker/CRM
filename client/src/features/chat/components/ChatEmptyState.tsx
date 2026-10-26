import { MessageSquare, Users, Sparkles, Send } from 'lucide-react';
import type { Conversation } from '../types';

interface ChatEmptyStateProps {
  variant: 'no-conversation' | 'empty-messages';
  conversation?: Conversation;
  currentUserId?: string;
  onOpenDirectory?: () => void;
  onNewGroup?: () => void;
  onSendStarter?: (text: string) => void;
}

export function ChatEmptyState({
  variant,
  conversation,
  currentUserId,
  onOpenDirectory,
  onNewGroup,
  onSendStarter,
}: ChatEmptyStateProps) {
  if (variant === 'no-conversation') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--chat-soft,#f8fafc)] p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h3 className="mt-5 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          Select a conversation
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
          Choose a chat from the sidebar, or start a new conversation with your team.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {onOpenDirectory && (
            <button
              type="button"
              onClick={onOpenDirectory}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Users className="h-4 w-4 text-teal-600" />
              Browse team
            </button>
          )}
          {onNewGroup && (
            <button
              type="button"
              onClick={onNewGroup}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Create group
            </button>
          )}
        </div>
      </div>
    );
  }

  const isGroup = conversation?.type === 'group';
  const peer = isGroup
    ? null
    : conversation?.members.find((m) => m._id !== currentUserId) || conversation?.members[0];
  const title = isGroup ? conversation?.name : peer?.name || 'this conversation';

  const starters = [
    '👋 Hi — ready when you are.',
    'Quick sync on current priorities?',
    'Sharing an update shortly.',
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
        <Send className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">
        Start the conversation
      </h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
        This is the beginning of your chat with{' '}
        <span className="font-semibold text-slate-800">{title}</span>.
      </p>
      {onSendStarter && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onSendStarter(starter)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
            >
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
