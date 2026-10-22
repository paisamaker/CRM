import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Receipt,
  Users,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { FinanceDashboardTab } from './components/FinanceDashboardTab';
import { IncomeExpenseTab } from './components/IncomeExpenseTab';
import { BillsReceiptsTab } from './components/BillsReceiptsTab';
import { SalaryManagementTab } from './components/SalaryManagementTab';
import { FinancialReportsTab } from './components/FinancialReportsTab';
import { FinanceCategoriesModal } from './components/FinanceCategoriesModal';
import { TransactionModal } from './components/TransactionModal';
import { BillModal } from './components/BillModal';
import { PaySalaryModal } from './components/PaySalaryModal';
import { syncFinanceQueries } from './financeSync';
import { cn } from '@/lib/utils';

type FinanceTab = 'dashboard' | 'income' | 'expenses' | 'bills' | 'salary' | 'reports';

const TABS: { id: FinanceTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'income', label: 'Income', icon: TrendingUp },
  { id: 'expenses', label: 'Expenses', icon: TrendingDown },
  { id: 'bills', label: 'Bills & Receipts', icon: Receipt },
  { id: 'salary', label: 'Salary', icon: Users },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

export function FinanceOverviewPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [txInitialType, setTxInitialType] = useState<'revenue' | 'expense'>('revenue');
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncFinanceQueries(qc);
      toast.success('Financial ledger synchronized');
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openIncomeModal = () => {
    setTxInitialType('revenue');
    setTransactionModalOpen(true);
  };

  const openExpenseModal = () => {
    setTxInitialType('expense');
    setTransactionModalOpen(true);
  };

  return (
    <div className="space-y-5 pb-12">
      <header className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
        <div className="bg-[linear-gradient(120deg,var(--brand-soft)_0%,transparent_45%,var(--orange-soft)_100%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--fg-secondary)]">
                <span>Finance</span>
                <span className="text-[var(--fg-muted)]">/</span>
                <span className="capitalize text-[var(--brand-deep)] font-semibold">
                  {TABS.find((t) => t.id === activeTab)?.label || activeTab}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--teal-text)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
                  Live ledger
                </span>
              </div>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--fg)]">
                Financial Management
              </h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--fg-secondary)]">
                P&amp;L, income, expenses, bills, and payroll in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)] transition hover:border-[var(--brand)]/30 hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:opacity-50"
                title="Refresh financial data"
              >
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin text-[var(--brand)]')} />
              </button>

              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setCategoriesModalOpen(true)}>
                <Layers className="h-3.5 w-3.5" /> Categories
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-[var(--teal-border)] text-[var(--teal-text)] text-xs hover:bg-[var(--teal-soft)]"
                onClick={openIncomeModal}
              >
                <TrendingUp className="h-3.5 w-3.5" /> Income
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-rose-200 text-rose-700 text-xs hover:bg-rose-50"
                onClick={openExpenseModal}
              >
                <TrendingDown className="h-3.5 w-3.5" /> Expense
              </Button>

              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setBillModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Bill
              </Button>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--bg)] px-3 py-2 scrollbar-none sm:px-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2 text-xs font-semibold transition',
                  isActive
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main>
        {activeTab === 'dashboard' && (
          <FinanceDashboardTab
            onOpenIncomeModal={openIncomeModal}
            onOpenExpenseModal={openExpenseModal}
            onOpenBillModal={() => setBillModalOpen(true)}
            onOpenSalaryModal={() => setSalaryModalOpen(true)}
            onNavigateTab={(tab) => setActiveTab(tab as FinanceTab)}
          />
        )}
        {activeTab === 'income' && <IncomeExpenseTab type="revenue" />}
        {activeTab === 'expenses' && <IncomeExpenseTab type="expense" />}
        {activeTab === 'bills' && <BillsReceiptsTab />}
        {activeTab === 'salary' && <SalaryManagementTab />}
        {activeTab === 'reports' && <FinancialReportsTab />}
      </main>

      <FinanceCategoriesModal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} />
      <TransactionModal
        open={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        initialType={txInitialType}
      />
      <BillModal open={billModalOpen} onClose={() => setBillModalOpen(false)} initialType="payable" />
      <PaySalaryModal open={salaryModalOpen} onClose={() => setSalaryModalOpen(false)} />
    </div>
  );
}
