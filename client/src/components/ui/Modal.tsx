import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-6xl',
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizes;
  /** Centered pop-up card dialog across all sections */
  variant?: 'dialog' | 'drawer';
  /** Prevent closing via backdrop / Escape */
  preventDismiss?: boolean;
  className?: string;
  overlayClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  preventDismiss = false,
  className,
  overlayClassName,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const preventDismissRef = useRef(preventDismiss);
  preventDismissRef.current = preventDismiss;

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    const prev = document.activeElement as HTMLElement | null;

    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !preventDismissRef.current) {
        onCloseRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto',
        'bg-slate-950/60 backdrop-blur-xs',
        'animate-[fadeIn_150ms_ease-out]',
        overlayClassName
      )}
      onClick={() => {
        if (!preventDismiss) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[min(90vh,860px)] w-full flex-col rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white shadow-2xl outline-hidden overflow-hidden',
          'animate-[popIn_200ms_cubic-bezier(0.16,1,0.3,1)]',
          sizes[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Card Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-7">{children}</div>

        {/* Card Footer */}
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5 sm:px-7">
            {footer}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
