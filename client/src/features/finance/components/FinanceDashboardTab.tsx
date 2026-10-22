import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  Users,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { TableShell, Skeleton } from '@/components/ui/Card';

const PIE_COLORS = ['#0d9488', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#db2777', '#4f46e5'];

interface Props {
  onOpenIncomeModal: () => void;
  onOpenExpenseModal: () => void;
  onOpenBillModal: () => void;
  onOpenSalaryModal: () => void;
  onNavigateTab: (tabId: string) => void;
}

type Tone = 'teal' | 'rose' | 'amber' | 'blue' | 'purple' | 'orange';

const toneStyles: Record<Tone, { wrap: string; icon: string; label: string; chip: string; link: string; border: string }> = {
  teal: {
    wrap: 'from-[var(--teal-soft)] via-white to-white border-[var(--teal-border)]',
    icon: 'bg-[var(--teal-soft)] text-[var(--teal-text)]',
    label: 'text-[var(--teal-text)]',
    chip: 'bg-[var(--teal-soft)] text-[var(--teal-text)]',
    link: 'text-[var(--teal-text)]',
    border: 'border-[var(--teal-border)]',
  },
  rose: {
    wrap: 'from-rose-50 via-white to-white border-rose-200',
    icon: 'bg-rose-50 text-rose-700',
    label: 'text-rose-700',
    chip: 'bg-rose-50 text-rose-700',
    link: 'text-rose-700',
    border: 'border-rose-100',
  },
  amber: {
    wrap: 'from-[var(--orange-soft)] via-white to-white border-[var(--orange-border)]',
    icon: 'bg-[var(--orange-soft)] text-[var(--orange-text)]',
    label: 'text-[var(--orange-text)]',
    chip: 'bg-[var(--orange-soft)] text-[var(--orange-text)]',
    link: 'text-[var(--orange-text)]',
    border: 'border-[var(--orange-border)]',
  },
  blue: {
    wrap: 'from-[var(--info-bg)] via-white to-white border-sky-200',
    icon: 'bg-[var(--info-bg)] text-sky-700',
    label: 'text-sky-700',
    chip: 'bg-[var(--info-bg)] text-sky-700',
    link: 'text-sky-700',
    border: 'border-sky-100',
  },
  purple: {
    wrap: 'from-[var(--purple-soft)] via-white to-white border-[var(--purple-border)]',
    icon: 'bg-[var(--purple-soft)] text-[var(--purple-text)]',
    label: 'text-[var(--purple-text)]',
    chip: 'bg-[var(--purple-soft)] text-[var(--purple-text)]',
    link: 'text-[var(--purple-text)]',
    border: 'border-[var(--purple-border)]',
  },
  orange: {
    wrap: 'from-[var(--orange-soft)] via-white to-white border-[var(--orange-border)]',
    icon: 'bg-[var(--orange-soft)] text-[var(--orange-text)]',
    label: 'text-[var(--orange-text)]',
    chip: 'bg-[var(--orange-soft)] text-[var(--orange-text)]',
    link: 'text-[var(--orange-text)]',
    border: 'border-[var(--orange-border)]',
  },
};

function KpiCard({
  tone,
  icon,
  title,
  subtitle,
  chip,
  value,
  footerLeft,
  footerRight,
  onClick,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  subtitle: string;
  chip?: string;
  value: string;
  footerLeft: ReactNode;
  footerRight?: ReactNode;
  onClick?: () => void;
}) {
  const t = toneStyles[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-full flex-col rounded-[var(--radius)] border bg-gradient-to-br p-4 text-left shadow-[var(--shadow-sm)] transition',
        t.wrap,
        onClick && 'cursor-pointer hover:shadow-[var(--shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)]', t.icon)}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className={cn('text-[11px] font-bold uppercase tracking-wide', t.label)}>{title}</div>
            <div className="mt-0.5 text-xs text-[var(--fg-secondary)]">{subtitle}</div>
          </div>
        </div>
        {chip ? (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', t.chip)}>{chip}</span>
        ) : null}
      </div>

      <div className="mt-4 text-2xl font-bold tracking-tight text-[var(--fg)] sm:text-[1.75rem]">{value}</div>

      <div className={cn('mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs', t.border)}>
        <span className="min-w-0 truncate text-[var(--fg-secondary)]">{footerLeft}</span>
        {footerRight ? <span className={cn('shrink-0 font-semibold', t.link)}>{footerRight}</span> : null}
      </div>
    </Comp>
  );
}

export function FinanceDashboardTab({
  onOpenIncomeModal: _onOpenIncomeModal,
  onOpenExpenseModal: _onOpenExpenseModal,
  onOpenBillModal: _onOpenBillModal,
  onOpenSalaryModal,
  onNavigateTab,
}: Props) {
  const [period, setPeriod] = useState<string>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['finance-dashboard-summary', period, customFrom, customTo],
    queryFn: async () => {
      const params: Record<string, string> = { period };
      if (period === 'custom') {
        if (customFrom) params.from = customFrom;
        if (customTo) params.to = customTo;
      }
      return (await api.get('/finance/dashboard-summary', { params })).data.data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
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

  const bankAccounts: Array<{
    _id: string;
    bankName: string;
    accountNumber?: string;
    currentBalance?: number;
    balance?: number;
    openingBalance?: number;
    accountType?: string;
  }> = dashData?.bankAccounts || [];
  const categoryExpenses: Array<{ category: string; total: number }> = dashData?.categoryBreakdown?.expense || [];
  const recentTransactions: Array<{
    _id: string;
    type: string;
    date: string;
    title?: string;
    category?: string;
    amount: number;
    client?: { name?: string };
    vendor?: { name?: string };
    employee?: { name?: string };
  }> = dashData?.recentTransactions || [];

  const periodLabel = period.replace(/_/g, ' ');
  const isProfit = cards.netProfit >= 0;

  if (isLoading && !dashData) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-[var(--radius)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Period only — actions live in page header to avoid duplication */}
      <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-1">
          {[
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This week' },
            { id: 'this_month', label: 'This month' },
            { id: 'this_year', label: 'This year' },
            { id: 'custom', label: 'Custom' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                'rounded-[7px] px-3 py-1.5 text-xs font-semibold capitalize transition',
                period === p.id
                  ? 'bg-[var(--brand)] text-white shadow-sm'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]'
              )}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-36 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-xs text-[var(--fg-secondary)]">to</span>
            <Input type="date" className="w-36 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        ) : (
          <p className="text-xs font-medium text-[var(--fg-secondary)]">
            Showing <span className="text-[var(--fg)] capitalize">{periodLabel}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          tone="teal"
          icon={<TrendingUp className="h-5 w-5" />}
          title="Total income"
          subtitle="Clients, projects & revenue"
          chip={`${cards.incomeCount} entries`}
          value={formatCurrency(cards.totalIncome)}
          footerLeft={`Period: ${periodLabel}`}
          footerRight="View ledger →"
          onClick={() => onNavigateTab('income')}
        />
        <KpiCard
          tone="rose"
          icon={<TrendingDown className="h-5 w-5" />}
          title="Total expenses"
          subtitle="Operations, bills & costs"
          chip={`${cards.expenseCount} entries`}
          value={formatCurrency(cards.totalExpenses)}
          footerLeft="Paid & approved costs"
          footerRight="View breakdown →"
          onClick={() => onNavigateTab('expenses')}
        />
        <KpiCard
          tone={isProfit ? 'teal' : 'amber'}
          icon={<DollarSign className="h-5 w-5" />}
          title={isProfit ? 'Net profit' : 'Net loss'}
          subtitle="Income − expenses"
          chip={
            cards.totalIncome > 0
              ? `${Math.round(((cards.totalIncome - cards.totalExpenses) / cards.totalIncome) * 100)}% margin`
              : '0% margin'
          }
          value={formatCurrency(cards.netProfit)}
          footerLeft={`${formatCurrency(cards.totalIncome)} − ${formatCurrency(cards.totalExpenses)}`}
          footerRight={isProfit ? 'Profitable' : 'Deficit'}
        />
        <KpiCard
          tone="blue"
          icon={<Wallet className="h-5 w-5" />}
          title="Available balance"
          subtitle="Cash & bank reserves"
          chip="Liquid"
          value={formatCurrency(cards.availableBalance)}
          footerLeft={`Opening ${formatCurrency(cards.openingBalance)}`}
          footerRight="Reconciled"
        />
        <KpiCard
          tone="purple"
          icon={<Users className="h-5 w-5" />}
          title="Salary paid"
          subtitle="Disbursed to employees"
          chip={`${cards.salaryPaidCount} paid`}
          value={formatCurrency(cards.salaryPaid)}
          footerLeft={`Pending ${formatCurrency(cards.salaryPending)} (${cards.salaryPendingCount})`}
          footerRight="Payroll →"
          onClick={() => onNavigateTab('salary')}
        />
        <KpiCard
          tone="orange"
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Pending payments"
          subtitle="Outstanding liabilities"
          chip="Liabilities"
          value={formatCurrency(cards.totalPendingLiabilities)}
          footerLeft={`Bills ${formatCurrency(cards.pendingBillsPayable)} · Salaries ${formatCurrency(cards.salaryPending)}`}
          footerRight="Bills →"
          onClick={() => onNavigateTab('bills')}
        />
      </div>

      {bankAccounts.length > 0 ? (
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-[var(--brand)]" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">Treasury & bank accounts</h3>
            </div>
            <span className="text-xs font-medium text-[var(--fg-secondary)]">
              Total reserves{' '}
              <span className="text-[var(--fg)]">
                {formatCurrency(bankAccounts.reduce((s, b) => s + (b.currentBalance ?? b.balance ?? 0), 0))}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((b) => (
              <div
                key={b._id}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[var(--fg)]">{b.bankName}</span>
                  <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--fg-secondary)]">
                    ••• {String(b.accountNumber || '').slice(-4) || '----'}
                  </span>
                </div>
                <div className="mt-2 text-lg font-bold text-[var(--brand-deep)]">
                  {formatCurrency(b.currentBalance ?? b.balance ?? 0)}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-[var(--fg-secondary)]">
                  <span>Opening {formatCurrency(b.openingBalance ?? 0)}</span>
                  <span>{b.accountType || 'Current'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)] lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg)]">Expenses by category</h3>
            <span className="text-xs text-[var(--fg-secondary)]">{categoryExpenses.length} categories</span>
          </div>

          <div className="flex h-44 items-center justify-center">
            {categoryExpenses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryExpenses}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                  >
                    {categoryExpenses.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: 'var(--fg)',
                    }}
                    formatter={(val) => [formatCurrency(Number(val ?? 0)), 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-[var(--fg-secondary)]">No expenses in this period</p>
            )}
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {categoryExpenses.map((c, i) => (
              <div
                key={c.category}
                className="flex items-center justify-between rounded-[8px] px-2 py-1.5 text-xs hover:bg-[var(--bg)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate text-[var(--fg-secondary)]">{c.category}</span>
                </div>
                <span className="shrink-0 font-semibold text-[var(--fg)]">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)] lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--fg)]">Recent transactions</h3>
              <p className="text-xs text-[var(--fg-secondary)]">Latest verified income and expense postings</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-[var(--brand-deep)] hover:underline"
                onClick={onOpenSalaryModal}
              >
                Pay salary
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--brand-deep)] hover:underline"
                onClick={() => onNavigateTab('income')}
              >
                View all →
              </button>
            </div>
          </div>

          <TableShell>
            {recentTransactions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--fg-secondary)]">
                No transactions recorded for this period
              </div>
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
                      <tr key={tx._id} className="transition-colors hover:bg-[var(--bg)]">
                        <td className="text-xs text-[var(--fg-secondary)]">{formatDate(tx.date)}</td>
                        <td>
                          <span
                            className={cn(
                              'inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              isIncome
                                ? 'bg-[var(--teal-soft)] text-[var(--teal-text)]'
                                : 'bg-rose-50 text-rose-700'
                            )}
                          >
                            {isIncome ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td>
                          <div className="text-xs font-semibold text-[var(--fg)]">{tx.title || tx.category}</div>
                          <div className="text-[10px] text-[var(--fg-secondary)]">{tx.category}</div>
                        </td>
                        <td className="max-w-[120px] truncate text-xs text-[var(--fg-secondary)]">{party}</td>
                        <td className="!text-right text-xs font-bold">
                          <span className={isIncome ? 'text-[var(--teal-text)]' : 'text-rose-700'}>
                            {isIncome ? '+' : '-'}
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableShell>
        </section>
      </div>
    </div>
  );
}
