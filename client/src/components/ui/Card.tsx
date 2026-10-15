import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card p-5', className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--fg-muted)]">{breadcrumb}</p>
        ) : null}
        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--fg-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius)] bg-[var(--brand-soft)] text-sm font-semibold text-[var(--brand)]">
        ∅
      </div>
      <h3 className="text-base font-semibold text-[var(--fg)]">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-[var(--fg-secondary)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[var(--radius-sm)] bg-[var(--divider)]', className)} />;
}

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}
