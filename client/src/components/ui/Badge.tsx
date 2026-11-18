import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  default: 'bg-[var(--bg-subtle)] text-[var(--fg-secondary)] border border-[var(--border)]',
  brand: 'bg-[var(--brand-soft)] text-[var(--brand-deep)] border border-[var(--teal-border)]',
  purple: 'bg-slate-100 text-slate-700 border border-slate-200',
  teal: 'bg-[var(--teal-soft)] text-[var(--teal-text)] border border-[var(--teal-border)]',
  orange: 'bg-[var(--orange-soft)] text-[var(--orange-text)] border border-[var(--orange-border)]',
  success: 'bg-[var(--success-bg)] text-[#047857] border border-[#a7f3d0]',
  warning: 'bg-[var(--warning-bg)] text-[#b45309] border border-[#fde68a]',
  danger: 'bg-[var(--danger-bg)] text-[#b91c1c] border border-[#fecaca]',
  info: 'bg-[var(--info-bg)] text-[#075985] border border-[#bae6fd]',
  gradient: 'bg-[var(--bg-subtle)] text-[var(--fg-secondary)] border border-[var(--border)]',
};

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize tracking-normal',
        tones[tone] || tones.default,
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status?: string) {
  const s = (status || '').toLowerCase().replace(/\s+/g, '_');
  if (['paid', 'approved', 'completed', 'active', 'won', 'disbursed', 'healthy', 'live'].includes(s))
    return 'teal';
  if (
    ['pending', 'pending_approval', 'review', 'sent', 'partially_paid', 'draft', 'negotiation', 'scheduled'].includes(
      s
    )
  )
    return 'orange';
  if (['rejected', 'overdue', 'cancelled', 'lost', 'critical', 'churned', 'disabled'].includes(s))
    return 'danger';
  if (['in_progress', 'contacted', 'proposal', 'open'].includes(s)) return 'info';
  return 'default';
}
