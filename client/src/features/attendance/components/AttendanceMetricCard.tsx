import { type LucideIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceMetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  badge?: string;
  badgeTone?: 'teal' | 'amber' | 'emerald' | 'slate' | 'rose';
  icon: LucideIcon;
  tooltip?: string;
  className?: string;
}

export function AttendanceMetricCard({
  label,
  value,
  subValue,
  badge,
  badgeTone = 'teal',
  icon: Icon,
  tooltip,
  className,
}: AttendanceMetricCardProps) {
  const badgeClasses = {
    teal: 'bg-teal-50 text-teal-800 border-teal-200/60',
    amber: 'bg-amber-50 text-amber-800 border-amber-200/60',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200/60',
  }[badgeTone];

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm',
        className
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-xs font-semibold text-slate-600">{label}</span>
          {tooltip && (
            <div className="relative group/tip" title={tooltip}>
              <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
            </div>
          )}
        </div>

        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-200/60 text-slate-600 transition group-hover:bg-teal-50 group-hover:text-teal-700 group-hover:border-teal-200/60">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Main Metric Value */}
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">{value}</span>

        {badge && (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-tight',
              badgeClasses
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Subtitle / Contextual Indicator */}
      {subValue && (
        <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">
          {subValue}
        </p>
      )}
    </div>
  );
}
