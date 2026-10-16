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
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick period buttons */}
          <div className="flex items-center p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  period === p.id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
                }`}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-36 text-xs"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-xs text-[var(--fg-muted)]">to</span>
              <Input
                type="date"
                className="w-36 text-xs"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print Report
          </Button>
          <Button variant="teal" size="sm" onClick={handleExportCSV} className="text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Income */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Total Income</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(summary.totalIncome)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Total revenue collected in period</div>
        </div>

        {/* Total Expenses */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400">Total Expenses</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(summary.totalExpenses)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Operational, bills & payroll costs</div>
        </div>

        {/* Net Profit / Loss */}
        <div
          className={`p-4 rounded-2xl bg-gradient-to-br ${
            summary.netProfit >= 0
              ? 'from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20'
              : 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20'
          } border shadow-sm`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium ${summary.netProfit >= 0 ? 'text-teal-400' : 'text-amber-400'}`}
            >
              Net {summary.netProfit >= 0 ? 'Profit' : 'Loss'}
            </span>
            <DollarSign className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(summary.netProfit)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Income minus verified expenses</div>
        </div>

        {/* Profit Margin */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400">Profit Margin</span>
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {summary.margin}%
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Net profit percentage of revenue</div>
        </div>
      </div>

      {/* Main Income vs Expense Comparison Chart */}
      <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Income vs Expenses (Monthly)</h3>
            <p className="text-xs text-[var(--fg-muted)]">Month-by-month comparative financial performance</p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={(v) => `₹${v / 1000}k`} />
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

      {/* Category Breakdowns: Income & Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Expenses Donut Chart */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Category-wise Expenses</h3>
            <span className="text-xs text-[var(--fg-muted)]">{categoryExpenses.length} categories</span>
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

        {/* Category Income Donut Chart */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Category-wise Income</h3>
            <span className="text-xs text-[var(--fg-muted)]">{categoryIncome.length} categories</span>
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
                <div className="font-semibold text-emerald-400">
                  {formatCurrency(c.total)}{' '}
                  <span className="text-[10px] text-[var(--fg-muted)] font-normal">({c.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Profit & Loss Statement Table */}
      <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Monthly Profit & Loss Statement</h3>
        <TableShell>
          <table className="data-table w-full text-left">
            <thead>
              <tr>
                <th>Month</th>
                <th className="!text-right">Total Income</th>
                <th className="!text-right">Total Expenses</th>
                <th className="!text-right">Net Profit / (Loss)</th>
                <th className="!text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTrends.map((m) => (
                <tr key={m.month}>
                  <td className="font-mono text-xs font-semibold text-[var(--fg-primary)]">{m.month}</td>
                  <td className="!text-right text-emerald-400 font-medium">{formatCurrency(m.income)}</td>
                  <td className="!text-right text-rose-400 font-medium">{formatCurrency(m.expense)}</td>
                  <td className="!text-right font-bold">
                    <span className={m.profit >= 0 ? 'text-teal-400' : 'text-amber-400'}>
                      {formatCurrency(m.profit)}
                    </span>
                  </td>
                  <td className="!text-right text-xs text-[var(--fg-muted)]">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>
    </div>
  );
}
