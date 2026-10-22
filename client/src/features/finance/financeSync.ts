import type { QueryClient } from '@tanstack/react-query';

/**
 * Centrally synchronizes all finance, transaction, bill, bank ledger, and approval queries
 * across the application with immediate active refetching.
 */
export async function syncFinanceQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['finance-transactions'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['transactions'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['finance-bills'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['transactions-bills'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['finance-dashboard-summary'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['finance-reports'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['finance-overview'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['finance-salaries'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['payroll'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['salary-work'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['invoices'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['bank-accounts'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['bank-accounts-lookup'], refetchType: 'active' }),
    qc.invalidateQueries({ queryKey: ['approvals'], refetchType: 'active' }),
  ]);
}
