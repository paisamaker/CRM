import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  Send,
  Smile,
  Loader2,
  Paperclip,
  X,
  Mic,
  Square,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFileSize } from '../chatUtils';
import type { Message, PendingAttachment } from '../types';

interface MessageComposerProps {
  onSend: (payload: {
    body: string;
    attachments?: PendingAttachment[];
    replyTo?: string;
  }) => void;
  isPending?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  onTyping?: (typing: boolean) => void;
  onUploadFile?: (file: File) => Promise<PendingAttachment>;
  draft?: string;
  onDraftChange?: (draft: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🙌', '🚀', '👀', '🎉', '💯', '🔥', '😂', '🙏'];

export function MessageComposer({
  onSend,
  isPending,
  placeholder = 'Type a message…',
  autoFocus,
  replyTo,
  onCancelReply,
  onTyping,
  onUploadFile,
  draft,
  onDraftChange,
}: MessageComposerProps) {
  const [text, setText] = useState(draft || '');
  const [emojiBarOpen, setEmojiBarOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(draft || '');
  }, [draft]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) textareaRef.current.focus();
  }, [autoFocus, replyTo?._id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (draftTimer.current) clearTimeout(draftTimer.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const emitTyping = (active: boolean) => {
    onTyping?.(active);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (active) typingTimer.current = setTimeout(() => onTyping?.(false), 2500);
  };

  const updateText = (value: string) => {
    setText(value);
    emitTyping(value.length > 0);
    if (onDraftChange) {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => onDraftChange(value), 600);
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || isPending || uploading) return;
    onSend({
      body: trimmed,
      attachments: attachments.length ? attachments : undefined,
      replyTo: replyTo?._id,
    });
    setText('');
    setAttachments([]);
    setEmojiBarOpen(false);
    emitTyping(false);
    onDraftChange?.('');
    onCancelReply?.();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !onUploadFile) return;
    setUploading(true);
    setRecordError('');
    try {
      const uploaded: PendingAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5 - attachments.length)) {
        const att = await onUploadFile(file);
        if (file.type.startsWith('image/')) att.previewUrl = URL.createObjectURL(file);
        uploaded.push(att);
      }
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 5));
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    setRecordError('');
    if (!navigator.mediaDevices?.getUserMedia || !onUploadFile) {
      setRecordError('Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        setUploading(true);
        try {
          const att = await onUploadFile(file);
          setAttachments((prev) => [...prev, att].slice(0, 5));
        } catch (err) {
          setRecordError(err instanceof Error ? err.message : 'Voice upload failed');
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecordError('Microphone permission denied.');
    }
  };

  const canSend = (text.trim() || attachments.length > 0) && !isPending && !uploading;

  return (
    <div className="sm-chat-composer shrink-0 px-3 py-2.5 sm:px-4">
      {replyTo && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-4 border-[#00a884] bg-white p-2.5 shadow-2xs">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#00a884]">
              {replyTo.sender?.name || 'Message'}
            </p>
            <p className="truncate text-xs text-[#54656f] mt-0.5">
              {replyTo.deletedForEveryone ? 'This message was deleted' : replyTo.body || 'Attachment'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-full p-1 text-[#54656f] hover:bg-slate-100 transition"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.url}
              className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : a.mime?.startsWith('audio/') ? (
                <Mic className="h-4 w-4 text-[#00a884]" />
              ) : a.mime?.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-[#00a884]" />
              ) : (
                <FileText className="h-4 w-4 text-[#54656f]" />
              )}
              <div className="min-w-0">
                <p className="max-w-[140px] truncate font-medium text-[#111b21]">{a.name}</p>
                <p className="text-[10px] text-[#8696a0]">{formatFileSize(a.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {recordError && (
        <p className="mb-2 text-[11px] font-medium text-rose-600" role="alert">
          {recordError}
        </p>
      )}

      {emojiBarOpen && (
        <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                updateText(`${text}${emoji}`);
                textareaRef.current?.focus();
              }}
              className="rounded-lg p-1.5 text-lg hover:bg-slate-100 transition"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp Web Input Row */}
      <div className="flex items-end gap-1.5 sm:gap-2">
        {/* Left Action Buttons: Smile & Paperclip */}
        <div className="flex items-center gap-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setEmojiBarOpen((p) => !p)}
            className={cn(
              'rounded-full p-2 text-[#54656f] hover:bg-slate-200/60 hover:text-[#111b21] transition',
              emojiBarOpen && 'bg-slate-200/80 text-[#00a884]'
            )}
            aria-label="Emoji"
            title="Emoji"
          >
            <Smile className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || attachments.length >= 5}
            className="rounded-full p-2 text-[#54656f] hover:bg-slate-200/60 hover:text-[#111b21] transition disabled:opacity-40"
            aria-label="Attach file"
            title="Attach"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
            ) : (
              <Paperclip className="h-6 w-6" />
            )}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/mp4,video/webm,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {/* Center WhatsApp Input Box */}
        <div className="sm-chat-composer-input flex min-w-0 flex-1 items-center rounded-lg border border-transparent bg-white px-3.5 py-1.5 transition">
          <label className="sr-only" htmlFor="chat-composer-input">
            Type a message
          </label>
          <textarea
            id="chat-composer-input"
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => updateText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            disabled={isPending}
            className="w-full resize-none bg-transparent py-1 text-[14.5px] leading-relaxed text-[#111b21] placeholder:text-[#8696a0] focus:outline-none"
            style={{ minHeight: '26px', maxHeight: '110px' }}
          />
        </div>

        {/* Right Action: Voice Mic or WhatsApp Send Button */}
        <div className="pb-0.5">
          {canSend ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              className="sm-chat-send flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs transition hover:bg-[#008069] active:scale-95"
              aria-label="Send message"
              title="Send"
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5 ml-0.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={
                recording
                  ? () => {
                      mediaRecorderRef.current?.stop();
                      setRecording(false);
                    }
                  : startRecording
              }
              disabled={uploading}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition',
                recording
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'text-[#54656f] hover:bg-slate-200/60 hover:text-[#111b21]'
              )}
              aria-label={recording ? 'Stop recording' : 'Voice message'}
              title={recording ? 'Stop recording' : 'Voice message'}
            >
              {recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
