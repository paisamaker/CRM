import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DonutSegment {
  label: string;
  count: number;
  pct?: number;
  color: string; // hex or tailwind class
}

export interface OverviewDonutCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconTone?: 'blue' | 'indigo' | 'amber' | 'teal';
  totalLabel: string;
  totalSubtext?: string;
  segments: DonutSegment[];
  linkTo: string;
  linkLabel: string;
}

export function OverviewDonutCard({
  title,
  subtitle,
  icon: Icon,
  iconTone = 'teal',
  totalLabel,
  totalSubtext,
  segments,
  linkTo,
  linkLabel,
}: OverviewDonutCardProps) {
  const iconThemes = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
  };

  const totalSum = segments.reduce((sum, s) => sum + (s.count || 0), 0);

  // SVG Donut calculation
  const radius = 32;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:shadow-xs">
      {/* Top Header */}
      <div>
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-2xs',
              iconThemes[iconTone]
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-[#171923] tracking-tight">{title}</h3>
            <p className="text-[11px] text-[#667085] truncate">{subtitle}</p>
          </div>
        </div>

        {/* Center: Donut Ring & Legend */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {/* SVG Donut Circle */}
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 80 80">
              {/* Background ring */}
              <circle
                cx="40"
                cy="40"
                r={radius}
                className="stroke-slate-100"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {/* Colored Segments */}
              {totalSum > 0 ? (
                segments.map((seg, idx) => {
                  const segRatio = seg.count / totalSum;
                  const strokeDasharray = `${segRatio * circumference} ${circumference}`;
                  const strokeDashoffset = -cumulativeOffset;
                  cumulativeOffset += segRatio * circumference;

                  return (
                    <circle
                      key={idx}
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke={seg.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      fill="transparent"
                      strokeLinecap="round"
                    />
                  );
                })
              ) : (
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  className="stroke-slate-200"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
              )}
            </svg>

            {/* Inner Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-extrabold text-[#171923] leading-none">
                {totalLabel}
              </span>
              {totalSubtext ? (
                <span className="mt-0.5 text-[8.5px] font-medium text-[#667085] leading-tight">
                  {totalSubtext}
                </span>
              ) : null}
            </div>
          </div>

          {/* Legend Items */}
          <div className="flex-1 space-y-1 text-xs">
            {segments.map((seg, idx) => {
              const displayPct =
                seg.pct != null
                  ? seg.pct
                  : totalSum > 0
                    ? Math.round((seg.count / totalSum) * 100)
                    : 0;

              return (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-[#667085] truncate">{seg.label}</span>
                  </div>
                  <span className="font-semibold text-[#171923] ml-1.5 shrink-0">
                    {seg.count} <span className="font-normal text-slate-400 text-[10px]">({displayPct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Link Action */}
      <div className="mt-4 pt-2.5 border-t border-slate-100 text-center">
        <Link
          to={linkTo}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
        >
          <span>{linkLabel}</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
