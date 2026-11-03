import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatAxis(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export function CeoYearProfitSection() {
  const year = new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ['ceo-year-profit', year],
    queryFn: async () => (await api.get('/finance/reports', { params: { period: 'this_year' } })).data.data,
    staleTime: 60_000,
  });

  const summary = data?.summary || {
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    margin: 0,
  };

  const chartData = useMemo(() => {
    const trends: Array<{ month: string; income: number; expense: number; profit: number }> =
      data?.monthlyTrends || [];
    const byKey = new Map(trends.map((t) => [t.month, t]));

    return MONTH_LABELS.map((label, idx) => {
      const key = `${year}-${String(idx + 1).padStart(2, '0')}`;
      const row = byKey.get(key);
      const income = Number(row?.income || 0);
      const expense = Number(row?.expense || 0);
      return {
        month: label,
        income,
        expense,
        profit: Number(row?.profit ?? income - expense),
      };
    });
  }, [data?.monthlyTrends, year]);

  const isProfit = Number(summary.netProfit) >= 0;

  if (isLoading && !data) {
    return (
      <div className="h-full min-h-[240px] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]" />
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xs">
      <div className="border-b border-[var(--border)] bg-[linear-gradient(120deg,var(--teal-soft)_0%,transparent_50%,var(--brand-soft)_100%)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
              Full year · {year}
            </div>
            <h3 className="mt-0.5 text-base font-bold tracking-tight text-[var(--fg)] sm:text-lg">
              Year-to-date profit overview
            </h3>
            <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">
              Revenue, expenses and net profit across all 12 months
            </p>
          </div>
          <Link
            to="/finance"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--fg-secondary)] hover:border-[var(--brand)]/30 hover:text-[var(--brand)]"
          >
            Open Finance <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Revenue
            </div>
            <div className="mt-0.5 text-sm font-bold text-emerald-700 sm:text-base">
              {formatCurrency(Number(summary.totalIncome || 0))}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Expenses
            </div>
            <div className="mt-0.5 text-sm font-bold text-rose-700 sm:text-base">
              {formatCurrency(Number(summary.totalExpenses || 0))}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-2.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Net {isProfit ? 'profit' : 'loss'} (YTD)
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  isProfit
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                )}
              >
                {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                Margin {Number(summary.margin || 0).toFixed(1)}%
              </span>
            </div>
            <div
              className={cn(
                'mt-0.5 flex items-center gap-2 text-lg font-black tracking-tight sm:text-xl',
                isProfit ? 'text-emerald-700' : 'text-rose-700'
              )}
            >
              <Wallet className="h-4 w-4 opacity-70" />
              {formatCurrency(Math.abs(Number(summary.netProfit || 0)))}
              {!isProfit ? <span className="text-xs font-semibold">loss</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 pb-3 pt-2 sm:px-4">
        <div className="mb-1 flex flex-wrap items-center gap-3 px-2 text-[10px] font-semibold text-[var(--fg-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-rose-400/80" /> Expenses
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#0d9488]" /> Net profit
          </span>
        </div>
        <div className="h-[220px] w-full sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="ceoYearProfitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatAxis}
                tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  background: 'var(--bg-elevated)',
                }}
                formatter={(value: number, name: string) => [
                  formatCurrency(Number(value || 0)),
                  name === 'income' ? 'Revenue' : name === 'expense' ? 'Expenses' : 'Net profit',
                ]}
              />
              <Bar dataKey="income" name="income" fill="#10b981" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expense" name="expense" fill="#fb7185" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Area
                type="monotone"
                dataKey="profit"
                name="profit"
                stroke="transparent"
                fill="url(#ceoYearProfitFill)"
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="profit"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0d9488', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
