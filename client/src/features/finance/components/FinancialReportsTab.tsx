import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Download,
  Printer,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieIcon,
  BarChart3,
  FileSpreadsheet,
  Layers,
  Users,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TableShell } from '@/components/ui/Card';

const COLORS = [
  '#0d9488', // teal
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // rose
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#ec4899', // pink
  '#6366f1', // indigo
];

export function FinancialReportsTab() {
  const [period, setPeriod] = useState<string>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['finance-reports', period, customFrom, customTo],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        if (customFrom) params.from = customFrom;
        if (customTo) params.to = customTo;
      }
      return (await api.get('/finance/reports', { params })).data.data;
    },
  });

  const summary = reportData?.summary || {
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    margin: 0,
  };

  const monthlyTrends: any[] = reportData?.monthlyTrends || [];
  const categoryExpenses: any[] = reportData?.categoryExpenses || [];
  const categoryIncome: any[] = reportData?.categoryIncome || [];
  const salaryTrends: any[] = reportData?.salaryTrends || [];

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = async () => {
    try {
      toast.info('Downloading complete financial report CSV…');
      const params = new URLSearchParams({ period });
      if (period === 'custom') {
        if (customFrom) params.append('startDate', customFrom);
        if (customTo) params.append('endDate', customTo);
      }
      const res = await api.get(`/finance/transactions/export?${params.toString()}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Financial_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Report CSV downloaded');
    } catch (err: any) {
      toast.error(getErrorMessage(err) || 'Export failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-stretch justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)] md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            {[
              { id: 'this_month', label: 'This month' },
              { id: 'this_year', label: 'This year' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  period === p.id
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]'
                }`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-36 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-xs text-[var(--fg-secondary)]">to</span>
              <Input type="date" className="w-36 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button variant="teal" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--radius)] border border-[var(--teal-border)] bg-gradient-to-br from-[var(--teal-soft)] via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--teal-text)]">Total income</span>
            <TrendingUp className="h-4 w-4 text-[var(--teal-text)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(summary.totalIncome)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Revenue in selected period</div>
        </div>

        <div className="rounded-[var(--radius)] border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-rose-700">Total expenses</span>
            <TrendingDown className="h-4 w-4 text-rose-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(summary.totalExpenses)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Ops, bills & payroll</div>
        </div>

        <div
          className={`rounded-[var(--radius)] border bg-gradient-to-br via-white to-white p-4 shadow-[var(--shadow-sm)] ${
            summary.netProfit >= 0
              ? 'border-[var(--teal-border)] from-[var(--teal-soft)]'
              : 'border-[var(--orange-border)] from-[var(--orange-soft)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-bold uppercase tracking-wide ${
                summary.netProfit >= 0 ? 'text-[var(--teal-text)]' : 'text-[var(--orange-text)]'
              }`}
            >
              Net {summary.netProfit >= 0 ? 'profit' : 'loss'}
            </span>
            <DollarSign
              className={`h-4 w-4 ${summary.netProfit >= 0 ? 'text-[var(--teal-text)]' : 'text-[var(--orange-text)]'}`}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(summary.netProfit)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Income − expenses</div>
        </div>

        <div className="rounded-[var(--radius)] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-sky-700">Profit margin</span>
            <BarChart3 className="h-4 w-4 text-sky-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{summary.margin}%</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Net as % of revenue</div>
        </div>
      </div>

      <div className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--fg)]">Income vs expenses</h3>
            <p className="text-xs text-[var(--fg-secondary)]">Monthly comparative performance</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[var(--fg-secondary)]">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-[var(--fg-secondary)]">Expenses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
              <span className="text-[var(--fg-secondary)]">Net Profit</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          {monthlyTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--fg-secondary)" fontSize={11} />
                <YAxis stroke="var(--fg-secondary)" fontSize={11} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-sunken)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [formatCurrency(Number(value)), '']}
                />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Net Profit" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--fg-muted)]">
              No monthly trend data recorded for this period
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Expenses by category</h3>
            <span className="text-xs text-[var(--fg-secondary)]">{categoryExpenses.length} categories</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            {categoryExpenses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryExpenses}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {categoryExpenses.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-sunken)',
                      borderColor: 'var(--border-subtle)',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Total Expense']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-[var(--fg-muted)]">No expenses recorded</div>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs pr-1">
            {categoryExpenses.map((c, i) => (
              <div key={c.category} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[var(--fg-secondary)]">{c.category}</span>
                </div>
                <div className="font-semibold text-[var(--fg-primary)]">
                  {formatCurrency(c.total)}{' '}
                  <span className="text-[10px] text-[var(--fg-muted)] font-normal">({c.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Income by category</h3>
            <span className="text-xs text-[var(--fg-secondary)]">{categoryIncome.length} categories</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            {categoryIncome.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryIncome}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {categoryIncome.map((_, index) => (
                      <Cell key={`inc-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-sunken)',
                      borderColor: 'var(--border-subtle)',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Total Revenue']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-[var(--fg-muted)]">No income recorded</div>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs pr-1">
            {categoryIncome.map((c, i) => (
              <div key={c.category} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[var(--fg-secondary)]">{c.category}</span>
                </div>
                <div className="font-semibold text-[var(--teal-text)]">
                  {formatCurrency(c.total)}{' '}
                  <span className="text-[10px] font-normal text-[var(--fg-secondary)]">({c.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
        <h3 className="text-sm font-semibold text-[var(--fg)]">Monthly P&amp;L statement</h3>
        <TableShell>
          <table className="data-table w-full text-left">
            <thead>
              <tr>
                <th>Month</th>
                <th className="!text-right">Income</th>
                <th className="!text-right">Expenses</th>
                <th className="!text-right">Net</th>
                <th className="!text-right">Txns</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTrends.map((m) => (
                <tr key={m.month}>
                  <td className="font-mono text-xs font-semibold text-[var(--fg)]">{m.month}</td>
                  <td className="!text-right font-medium text-[var(--teal-text)]">{formatCurrency(m.income)}</td>
                  <td className="!text-right font-medium text-rose-700">{formatCurrency(m.expense)}</td>
                  <td className="!text-right font-bold">
                    <span className={m.profit >= 0 ? 'text-[var(--teal-text)]' : 'text-[var(--orange-text)]'}>
                      {formatCurrency(m.profit)}
                    </span>
                  </td>
                  <td className="!text-right text-xs text-[var(--fg-secondary)]">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>
    </div>
  );
}
