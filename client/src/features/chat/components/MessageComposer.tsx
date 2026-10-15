import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, Smile, CornerDownLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageComposerProps {
  onSend: (text: string) => void;
  isPending?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '🙌', '🚀', '👀', '🎉', '💯', '💬'];

export function MessageComposer({
  onSend,
  isPending,
  placeholder = 'Type a message…',
  autoFocus,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [emojiBarOpen, setEmojiBarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${newHeight}px`;
  }, [text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    onSend(trimmed);
    setText('');
    setEmojiBarOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`);
    textareaRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-[#E4E7EC] bg-white p-3 sm:p-4">
      <div
        className={cn(
          'relative rounded-xl border border-slate-200 bg-[#F9FAFB] transition-all',
          'focus-within:border-[#0D9488] focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/15'
        )}
      >
        {/* Quick Emoji Bar */}
        {emojiBarOpen && (
          <div className="flex items-center gap-1 border-b border-slate-200/80 px-2.5 py-1.5 bg-slate-50/80">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Quick:
            </span>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleInsertEmoji(emoji)}
                className="rounded p-1 text-base leading-none transition hover:bg-white hover:scale-115 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Text Area */}
        <div className="p-2.5">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isPending}
            className="w-full resize-none bg-transparent text-xs sm:text-sm text-[#182230] placeholder-slate-400 focus:outline-none"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEmojiBarOpen((prev) => !prev)}
              className={cn(
                'rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800',
                emojiBarOpen && 'bg-teal-50 text-[#0D9488]'
              )}
              title="Add emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
            <span className="hidden text-[10.5px] text-slate-400 sm:inline">
              <CornerDownLeft className="inline h-2.5 w-2.5 mr-0.5" />
              Enter to send, Shift+Enter for new line
            </span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim() || isPending}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-xs transition',
              text.trim() && !isPending
                ? 'bg-[#0D9488] text-white hover:bg-[#0B7D72] active:scale-97'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
