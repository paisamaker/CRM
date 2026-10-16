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
  Wallet,
  ShieldCheck,
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

type FinanceTab = 'dashboard' | 'income' | 'expenses' | 'bills' | 'salary' | 'reports';

export function FinanceOverviewPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [txInitialType, setTxInitialType] = useState<'revenue' | 'expense'>('revenue');
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['finance-dashboard-summary'] }),
        qc.invalidateQueries({ queryKey: ['finance-transactions'] }),
        qc.invalidateQueries({ queryKey: ['finance-bills'] }),
        qc.invalidateQueries({ queryKey: ['finance-salaries'] }),
        qc.invalidateQueries({ queryKey: ['finance-reports'] }),
        qc.invalidateQueries({ queryKey: ['bank-accounts'] }),
      ]);
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
    <div className="space-y-6 pb-12">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)]">
              <span>Finance</span>
              <span>/</span>
              <span className="font-semibold text-teal-400 capitalize">{activeTab}</span>
              <span className="mx-1">•</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-Time Database Ledger
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--fg-primary)]">
                Financial Management System
              </h1>
              <span className="text-xs text-[var(--fg-muted)]">
                Executive P&L, Income, Expenses, Bills & Payroll
              </span>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-hover)] active:scale-95 transition disabled:opacity-50"
              title="Refresh financial data"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-teal-400' : ''}`} />
            </button>

            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => setCategoriesModalOpen(true)}
            >
              <Layers className="w-3.5 h-3.5" /> Categories
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={openIncomeModal}
            >
              <TrendingUp className="w-3.5 h-3.5" /> + Income
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              onClick={openExpenseModal}
            >
              <TrendingDown className="w-3.5 h-3.5" /> + Expense
            </Button>

            <Button
              variant="teal"
              size="sm"
              className="text-xs gap-1.5 shadow-md shadow-teal-500/10"
              onClick={() => setBillModalOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> + Bill
            </Button>
          </div>
        </div>

        {/* ── MODULE NAVIGATION TABS ───────────────────────────────────────── */}
        <div className="mt-5 flex items-center gap-1 border-t border-[var(--border-subtle)] pt-4 overflow-x-auto scrollbar-none">
          {[
            { id: 'dashboard', label: 'Finance Dashboard', icon: LayoutDashboard },
            { id: 'income', label: 'Income', icon: TrendingUp },
            { id: 'expenses', label: 'Expenses', icon: TrendingDown },
            { id: 'bills', label: 'Bills & Receipts', icon: Receipt },
            { id: 'salary', label: 'Salary Management', icon: Users },
            { id: 'reports', label: 'Financial Reports', icon: FileSpreadsheet },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as FinanceTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-sunken)]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[var(--fg-muted)]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── TAB CONTENT PANELS ────────────────────────────────────────────── */}
      <main className="transition-all">
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

      {/* ── GLOBAL MODALS ─────────────────────────────────────────────────── */}
      <FinanceCategoriesModal
        open={categoriesModalOpen}
        onClose={() => setCategoriesModalOpen(false)}
      />

      <TransactionModal
        open={transactionModalOpen}
        onClose={() => setTransactionModalOpen(false)}
        initialType={txInitialType}
      />

      <BillModal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        initialType="payable"
      />

      <PaySalaryModal
        open={salaryModalOpen}
        onClose={() => setSalaryModalOpen(false)}
      />
    </div>
  );
}
