import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import {
  TrendingDown,
  TrendingUp,
  Wallet,
  PiggyBank,
  CreditCard,
  Percent,
  Users,
  Briefcase,
  AlertCircle,
  FileCheck2,
  CheckCircle2,
  Clock,
  Target,
  ShieldCheck,
  Receipt,
  Layers,
  ChevronRight,
  IndianRupee,
  type LucideIcon,
} from 'lucide-react';

function getFallbackIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes('revenue') || l.includes('inflow') || l.includes('billing')) return IndianRupee;
  if (l.includes('profit') || l.includes('net')) return PiggyBank;
  if (l.includes('expense') || l.includes('overhead') || l.includes('cost')) return CreditCard;
  if (l.includes('margin') || l.includes('percent')) return Percent;
  if (l.includes('conversion') || l.includes('funnel') || l.includes('deal')) return Target;
  if (l.includes('retention') || l.includes('security')) return ShieldCheck;
  if (l.includes('client')) return Users;
  if (l.includes('project')) return Briefcase;
  if (l.includes('approval')) return FileCheck2;
  if (l.includes('task')) return CheckCircle2;
  if (l.includes('check') || l.includes('attend') || l.includes('time')) return Clock;
  if (l.includes('lead') || l.includes('pipeline')) return Layers;
  if (l.includes('receivable') || l.includes('ar') || l.includes('invoice')) return Receipt;
  return Wallet;
}

export interface KpiCardProps {
  label: string;
  value: number;
  change?: number;
  sparkline?: number[];
  format?: 'number' | 'currency' | 'percent';
  className?: string;
  accent?: 'indigo' | 'teal' | 'orange' | 'purple' | 'green';
  icon?: LucideIcon;
  to?: string;
  onClick?: () => void;
  periodLabel?: string;
}

export function KpiCard({
  label,
  value,
  change,
  sparkline,
  format = 'number',
  className,
  accent = 'teal',
  icon: PropIcon,
  to,
  onClick,
  periodLabel = 'vs last period',
}: KpiCardProps) {
  const display =
    format === 'currency'
      ? formatCurrency(value)
      : format === 'percent'
        ? formatPercent(value)
        : new Intl.NumberFormat('en-IN').format(value || 0);

  const data = (sparkline || []).map((v, i) => ({ i, v }));
  const up = (change || 0) >= 0;
  const isZero = change === 0 || change == null;
  const Icon = PropIcon || getFallbackIcon(label);

  const theme = {
    teal: {
      iconBox: 'bg-[#ECFDF5] text-[#0D9488] border border-[#A7F3D0]/60',
      stroke: '#0D9488',
      fillId: 'kpiFillTeal',
    },
    purple: {
      iconBox: 'bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]/60',
      stroke: '#7C3AED',
      fillId: 'kpiFillPurple',
    },
    orange: {
      iconBox: 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]/60',
      stroke: '#D97706',
      fillId: 'kpiFillOrange',
    },
    green: {
      iconBox: 'bg-[#ECFDF5] text-[#16A34A] border border-[#BBF7D0]/60',
      stroke: '#16A34A',
      fillId: 'kpiFillGreen',
    },
    indigo: {
      iconBox: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]/60',
      stroke: '#4F46E5',
      fillId: 'kpiFillIndigo',
    },
  }[accent] || {
    iconBox: 'bg-[#ECFDF5] text-[#0D9488] border border-[#A7F3D0]/60',
    stroke: '#0D9488',
    fillId: 'kpiFillTeal',
  };

  const content = (
    <div
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4.5 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:shadow-xs',
        to || onClick ? 'cursor-pointer' : '',
        className
      )}
      onClick={onClick}
    >
      {/* Top Row: Icon on left, Chevron link on right */}
      <div className="flex items-center justify-between">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-2xs', theme.iconBox)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all">
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {/* Metric Label & Big Value */}
      <div className="mt-3">
        <p className="text-xs font-medium text-[#667085] truncate">
          {label}
        </p>
        <p className="mt-1 truncate text-2xl font-bold tracking-tight text-[#171923] sm:text-[28px]">
          {display}
        </p>
      </div>

      {/* Bottom Row: Trend pill on left, Mini Sparkline on right */}
      <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-100/90">
        {change != null ? (
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                isZero
                  ? 'text-slate-500'
                  : up
                    ? 'text-emerald-700'
                    : 'text-rose-600'
              )}
            >
              {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {formatPercent(Math.abs(change))}
            </span>
            <span className="text-[11px] text-slate-400 truncate">{periodLabel}</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 truncate">Real-time sync</span>
        )}

        {/* Mini Sparkline Chart / Visual Indicator */}
        {data.length > 1 ? (
          <div className="h-7 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={theme.fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.stroke} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={theme.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={theme.stroke}
                  fill={`url(#${theme.fillId})`}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : format === 'percent' ? (
          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="block">{content}</Link>;
  }

  return content;
}
