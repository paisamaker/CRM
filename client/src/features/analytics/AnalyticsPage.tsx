import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/charts/KpiCard';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { BarChart3, TrendingUp, Users, Target, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export function AnalyticsPage() {
  const revenue = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: async () => (await api.get('/analytics/revenue-growth')).data.data,
  });
  const profit = useQuery({
    queryKey: ['analytics-profit'],
    queryFn: async () => (await api.get('/analytics/profitability')).data.data,
  });
  const pipeline = useQuery({
    queryKey: ['analytics-pipeline'],
    queryFn: async () => (await api.get('/analytics/pipeline')).data.data,
  });
  const conversion = useQuery({
    queryKey: ['analytics-conversion'],
    queryFn: async () => (await api.get('/analytics/conversion')).data.data,
  });
  const clients = useQuery({
    queryKey: ['analytics-clients'],
    queryFn: async () => (await api.get('/analytics/clients')).data.data,
  });

  return (
    <div className="space-y-6">
      {/* Analytics Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
                Business Intelligence &amp; Analytics
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Insights
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Growth, Profitability &amp; Conversion Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed max-w-2xl">
              Comprehensive performance analysis across deal pipeline, client lifetime value, operational margins, and acquisition channels.
            </p>
          </div>
        </div>
      </div>

      {/* Tri-Color KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Deal Conversion Rate"
          value={conversion.data?.overall?.rate || 0}
          format="percent"
          accent="teal"
          icon={Target}
        />
        <KpiCard
          label="Active Retained Clients"
          value={clients.data?.active || 0}
          accent="purple"
          icon={Users}
        />
        <KpiCard
          label="New Clients (This Mo)"
          value={clients.data?.newClients || 0}
          accent="orange"
          icon={ArrowUpRight}
        />
        <KpiCard
          label="Client Retention Rate"
          value={clients.data?.retention || 0}
          format="percent"
          accent="teal"
          icon={TrendingUp}
        />
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Revenue Growth with Teal Gradient */}
        <Card>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Revenue Trajectory</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Monthly recurring and campaign billing growth</p>
            </div>
            <Badge tone="teal" className="text-[10px]">
              Revenue
            </Badge>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue.data || []}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D9488" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0D9488" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--fg-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--teal-border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#0D9488" strokeWidth={2.5} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Profitability with Light Purple and Teal Lines */}
        <Card>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Profitability &amp; Operating Margin</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Net operating profit vs margin percentage</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold text-[var(--purple)]">
                <span className="h-2 w-2 rounded-full bg-[var(--purple)]" />
                Profit
              </span>
              <span className="flex items-center gap-1 font-semibold text-[var(--teal)]">
                <span className="h-2 w-2 rounded-full bg-[var(--teal)]" />
                Margin %
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profit.data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--purple-border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Line type="monotone" dataKey="netProfit" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="margin" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Sales Pipeline with Light Orange & Purple Bars */}
        <Card>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Sales Funnel by Stage</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Active deal count &amp; estimated pipeline volume</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold text-[var(--purple)]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--purple)]" />
                Deals
              </span>
              <span className="flex items-center gap-1 font-semibold text-[var(--orange)]">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--orange)]" />
                Value
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipeline.data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--fg-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Bar dataKey="count" fill="#8B5CF6" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="value" fill="#FB923C" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Clients with Revenue Badges */}
        <Card>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--divider)] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">Top Agency Clients</h3>
              <p className="text-[11px] text-[var(--fg-muted)]">Highest contribution by annualized billing</p>
            </div>
            <Badge tone="purple" className="text-[10px]">
              Portfolio Leaders
            </Badge>
          </div>
          <div className="space-y-2.5">
            {(clients.data?.topClients || []).map((c: { _id: string; company?: string; name?: string; revenue: number }, i: number) => (
              <div
                key={c._id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-xs transition hover:border-[var(--purple-border)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--purple-soft)] text-xs font-bold text-[var(--purple-text)]">
                    {i + 1}
                  </span>
                  <span className="font-bold text-[var(--fg)]">{c.company || c.name}</span>
                </div>
                <span className="font-black text-[var(--teal)]">{formatCurrency(c.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--fg-muted)]">
            <span className="font-semibold text-[var(--fg-secondary)]">Conversion by channel: </span>
            {(conversion.data?.bySource || [])
              .slice(0, 3)
              .map((s: { source: string; rate: number }) => `${s.source} (${formatPercent(s.rate)})`)
              .join(' · ')}
          </div>
        </Card>
      </div>
    </div>
  );
}
