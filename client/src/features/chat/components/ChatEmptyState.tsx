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
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-[#F9FAFB]/50">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 border border-teal-200/60 text-[#0D9488] shadow-xs">
          <MessageSquare className="h-8 w-8" />
        </div>

        <h3 className="mt-4 text-base font-bold text-[#182230] sm:text-lg tracking-tight">
          Select a conversation to start messaging
        </h3>
        <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-[#667085] leading-relaxed">
          Choose a conversation from the sidebar, or connect directly with colleagues across your team.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onOpenDirectory && (
            <button
              type="button"
              onClick={onOpenDirectory}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Users className="h-4 w-4 text-[#0D9488]" />
              <span>Browse Team Directory</span>
            </button>
          )}

          {onNewGroup && (
            <button
              type="button"
              onClick={onNewGroup}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0B7D72]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Create New Group</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // empty-messages state
  const isGroup = conversation?.type === 'group';
  const peer = isGroup
    ? null
    : conversation?.members.find((m) => m._id !== currentUserId) || conversation?.members[0];

  const title = isGroup ? conversation?.name : peer?.name || 'this conversation';

  const starters = [
    '👋 Hi there! Let’s sync on recent updates.',
    '📋 Sharing quick status on ongoing tasks.',
    '🤝 Ready to review project milestones whenever you are.',
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-200/60 text-[#0D9488] shadow-2xs">
        <Send className="h-6 w-6" />
      </div>

      <h3 className="mt-4 text-base font-bold text-[#182230] tracking-tight">
        Start the conversation
      </h3>
      <p className="mt-1 max-w-md text-xs text-[#667085] leading-relaxed">
        This is the beginning of your chat history with <span className="font-semibold text-slate-800">{title}</span>.
        Messages sent here are recorded securely in real-time.
      </p>

      {onSendStarter && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Quick Starters
          </span>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => onSendStarter(starter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-900 shadow-2xs"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
