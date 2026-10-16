import { useState } from 'react';
import { PageHeader } from '@/components/ui/Card';
import { IncomeExpenseTab } from './components/IncomeExpenseTab';
import { TrendingDown, TrendingUp } from 'lucide-react';

export function TransactionsPage() {
  const [activeType, setActiveType] = useState<'expense' | 'revenue'>('expense');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Transactions Ledger"
          description="Detailed income and expense records with category tracking, search, and CSV export"
        />

        <div className="flex items-center p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)] shrink-0 self-start sm:self-auto">
          <button
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeType === 'expense'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setActiveType('expense')}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Expenses
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeType === 'revenue'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setActiveType('revenue')}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Income
          </button>
        </div>
      </div>

      <IncomeExpenseTab type={activeType} />
    </div>
  );
}
