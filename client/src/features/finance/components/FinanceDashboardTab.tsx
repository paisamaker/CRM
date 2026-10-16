import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  Users,
  AlertTriangle,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  CreditCard,
  Building2,
  FileText,
  DollarSign,
  Plus,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { TableShell } from '@/components/ui/Card';

const PIE_COLORS = ['#f43f5e', '#3b82f6', '#f59e0b', '#0d9488', '#8b5cf6', '#ec4899', '#6366f1'];

interface Props {
  onOpenIncomeModal: () => void;
  onOpenExpenseModal: () => void;
  onOpenBillModal: () => void;
  onOpenSalaryModal: () => void;
  onNavigateTab: (tabId: string) => void;
}

export function FinanceDashboardTab({
  onOpenIncomeModal,
  onOpenExpenseModal,
  onOpenBillModal,
  onOpenSalaryModal,
  onNavigateTab,
}: Props) {
  const [period, setPeriod] = useState<string>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: dashData, isLoading, refetch } = useQuery({
    queryKey: ['finance-dashboard-summary', period, customFrom, customTo],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        if (customFrom) params.from = customFrom;
        if (customTo) params.to = customTo;
      }
      return (await api.get('/finance/dashboard-summary', { params })).data.data;
    },
  });

  const cards = dashData?.cards || {
    totalIncome: 0,
    incomeCount: 0,
    totalExpenses: 0,
    expenseCount: 0,
    netProfit: 0,
    openingBalance: 0,
    availableBalance: 0,
    salaryPaid: 0,
    salaryPaidCount: 0,
    salaryPending: 0,
    salaryPendingCount: 0,
    pendingBillsPayable: 0,
    pendingBillsReceivable: 0,
    pendingInvoicesReceivable: 0,
    totalPendingLiabilities: 0,
  };

  const bankAccounts: any[] = dashData?.bankAccounts || [];
  const categoryExpenses: any[] = dashData?.categoryBreakdown?.expense || [];
  const recentTransactions: any[] = dashData?.recentTransactions || [];

  return (
    <div className="space-y-6">
      {/* Top Filter and Action Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl">
        {/* Quick Period Filters */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          {[
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'this_year', label: 'This Year' },
            { id: 'custom', label: 'Custom' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
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

        {/* Custom Date Pickers */}
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

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            onClick={onOpenIncomeModal}
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> + Income
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            onClick={onOpenExpenseModal}
          >
            <ArrowDownRight className="w-3.5 h-3.5" /> + Expense
          </Button>
          <Button
            size="sm"
            variant="teal"
            className="text-xs gap-1 shadow-md shadow-teal-500/10"
            onClick={onOpenBillModal}
          >
            <Plus className="w-3.5 h-3.5" /> + Bill
          </Button>
        </div>
      </div>

      {/* ==================================================
          6 CORE FINANCIAL DASHBOARD CARDS
          ================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card A: Total Income */}
        <div
          onClick={() => onNavigateTab('income')}
          className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm hover:border-emerald-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Total Income</div>
                <div className="text-[11px] text-[var(--fg-muted)]">Clients, projects & revenue</div>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {cards.incomeCount} entries
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-[var(--fg-primary)] tracking-tight">
              {formatCurrency(cards.totalIncome)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-500/15 text-xs">
              <span className="text-[var(--fg-muted)]">Period: {period.replace('_', ' ')}</span>
              <span className="text-emerald-400 group-hover:underline flex items-center gap-0.5">
                View Ledger &rarr;
              </span>
            </div>
          </div>
        </div>

        {/* Card B: Total Expenses */}
        <div
          onClick={() => onNavigateTab('expenses')}
          className="p-5 rounded-2xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 shadow-sm hover:border-rose-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Total Expenses</div>
                <div className="text-[11px] text-[var(--fg-muted)]">Operations, bills & salaries</div>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-medium">
              {cards.expenseCount} entries
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-[var(--fg-primary)] tracking-tight">
              {formatCurrency(cards.totalExpenses)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-rose-500/15 text-xs">
              <span className="text-[var(--fg-muted)]">Paid & approved costs</span>
              <span className="text-rose-400 group-hover:underline flex items-center gap-0.5">
                View Breakdown &rarr;
              </span>
            </div>
          </div>
        </div>

        {/* Card C: Net Profit / Loss */}
        <div
          className={`p-5 rounded-2xl bg-gradient-to-br ${
            cards.netProfit >= 0
              ? 'from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20'
              : 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20'
          } border shadow-sm transition-all`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`p-2 rounded-xl ${
                  cards.netProfit >= 0 ? 'bg-teal-500/15 text-teal-400' : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    cards.netProfit >= 0 ? 'text-teal-400' : 'text-amber-400'
                  }`}
                >
                  Net {cards.netProfit >= 0 ? 'Profit' : 'Loss'}
                </div>
                <div className="text-[11px] text-[var(--fg-muted)]">Total Income - Total Expenses</div>
              </div>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                cards.netProfit >= 0
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {cards.totalIncome > 0
                ? `${Math.round(((cards.totalIncome - cards.totalExpenses) / cards.totalIncome) * 100)}% margin`
                : '0% margin'}
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-[var(--fg-primary)] tracking-tight">
              {formatCurrency(cards.netProfit)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
              <span className="text-[var(--fg-muted)]">
                Formula: ₹{cards.totalIncome.toLocaleString()} - ₹{cards.totalExpenses.toLocaleString()}
              </span>
              <span className={cards.netProfit >= 0 ? 'text-teal-400 font-medium' : 'text-amber-400 font-medium'}>
                {cards.netProfit >= 0 ? 'Profitable' : 'Deficit'}
              </span>
            </div>
          </div>
        </div>

        {/* Card D: Available Balance */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border border-blue-500/30 shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Available Balance</div>
                <div className="text-[11px] text-[var(--fg-muted)]">Actual cash & bank reserves</div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Liquid Cash
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-blue-300 tracking-tight">
              {formatCurrency(cards.availableBalance)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-500/20 text-xs">
              <span className="text-[var(--fg-muted)]">
                Opening Balance: {formatCurrency(cards.openingBalance)}
              </span>
              <span className="text-[11px] text-blue-400 font-medium">Reconciled</span>
            </div>
          </div>
        </div>

        {/* Card E: Total Salary Paid */}
        <div
          onClick={() => onNavigateTab('salary')}
          className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border border-indigo-500/20 shadow-sm hover:border-indigo-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Total Salary Paid</div>
                <div className="text-[11px] text-[var(--fg-muted)]">Actually disbursed to employees</div>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">
              {cards.salaryPaidCount} paid
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-[var(--fg-primary)] tracking-tight">
              {formatCurrency(cards.salaryPaid)}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-500/15 text-xs">
              <span className="text-amber-400 font-medium">
                Pending: {formatCurrency(cards.salaryPending)} ({cards.salaryPendingCount})
              </span>
              <span className="text-indigo-400 group-hover:underline flex items-center gap-0.5">
                Payroll &rarr;
              </span>
            </div>
          </div>
        </div>

        {/* Card F: Pending Payments & Outstanding Liabilities */}
        <div
          onClick={() => onNavigateTab('bills')}
          className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-sm hover:border-amber-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Pending Payments</div>
                <div className="text-[11px] text-[var(--fg-muted)]">Outstanding business liabilities</div>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
              Liabilities
            </span>
          </div>

          <div className="mt-4">
            <div className="text-3xl font-extrabold text-amber-400 tracking-tight">
              {formatCurrency(cards.totalPendingLiabilities)}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2 pt-2 border-t border-amber-500/15 text-xs">
              <span className="text-[var(--fg-muted)] truncate">
                Bills: {formatCurrency(cards.pendingBillsPayable)}
              </span>
              <span className="text-[var(--fg-muted)] truncate text-right">
                Salaries: {formatCurrency(cards.salaryPending)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================
          TREASURY / BANK ACCOUNTS BREAKDOWN
          ================================================== */}
      {bankAccounts.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-teal-400" />
              <h3 className="font-semibold text-sm text-[var(--fg-primary)]">
                Treasury & Active Bank Accounts
              </h3>
            </div>
            <span className="text-xs text-[var(--fg-muted)]">
              Total Recorded Reserves: {formatCurrency(bankAccounts.reduce((s, b) => s + (b.currentBalance ?? b.balance ?? 0), 0))}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bankAccounts.map((b) => (
              <div
                key={b._id}
                className="p-3.5 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[var(--fg-primary)]">{b.bankName}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)]">
                    ••• {String(b.accountNumber).slice(-4)}
                  </span>
                </div>
                <div className="text-lg font-bold text-teal-400">
                  {formatCurrency(b.currentBalance ?? b.balance ?? 0)}
                </div>
                <div className="text-[10px] text-[var(--fg-muted)] flex items-center justify-between">
                  <span>Opening: {formatCurrency(b.openingBalance ?? 0)}</span>
                  <span>{b.accountType || 'Current'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================
          EXPENSES BREAKDOWN & RECENT ACTIVITY
          ================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expenses by Category */}
        <div className="lg:col-span-1 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[var(--fg-primary)]">Expenses by Category</h3>
            <span className="text-xs text-[var(--fg-muted)]">{categoryExpenses.length} categories</span>
          </div>

          <div className="h-48 w-full flex items-center justify-center">
            {categoryExpenses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryExpenses}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {categoryExpenses.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-sunken)',
                      borderColor: 'var(--border-subtle)',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                    formatter={(val: any) => [formatCurrency(Number(val)), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-[var(--fg-muted)]">No expenses in this period</div>
            )}
          </div>

          <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
            {categoryExpenses.map((c, i) => (
              <div
                key={c.category}
                className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-[var(--fg-secondary)] truncate max-w-[130px]">{c.category}</span>
                </div>
                <span className="font-semibold text-[var(--fg-primary)]">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions Feed */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border-subtle)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-[var(--fg-primary)]">Recent Financial Transactions</h3>
              <p className="text-xs text-[var(--fg-muted)]">Latest verified income and expense postings</p>
            </div>
            <button
              type="button"
              className="text-xs text-teal-400 hover:underline"
              onClick={() => onNavigateTab('income')}
            >
              View All Transactions &rarr;
            </button>
          </div>

          <TableShell>
            {recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--fg-muted)]">No transactions recorded yet</div>
            ) : (
              <table className="data-table w-full text-left">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category / Title</th>
                    <th>Party</th>
                    <th className="!text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => {
                    const isIncome = tx.type === 'revenue';
                    const party = tx.client?.name || tx.vendor?.name || tx.employee?.name || '—';

                    return (
                      <tr key={tx._id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                        <td className="text-xs">{formatDate(tx.date)}</td>
                        <td>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isIncome ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {isIncome ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td>
                          <div className="font-medium text-xs text-[var(--fg-primary)]">
                            {tx.title || tx.category}
                          </div>
                          <div className="text-[10px] text-[var(--fg-muted)]">{tx.category}</div>
                        </td>
                        <td className="text-xs text-[var(--fg-secondary)] truncate max-w-[120px]">{party}</td>
                        <td className="!text-right font-bold text-xs">
                          <span className={isIncome ? 'text-emerald-400' : 'text-rose-400'}>
                            {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableShell>
        </div>
      </div>
    </div>
  );
}
