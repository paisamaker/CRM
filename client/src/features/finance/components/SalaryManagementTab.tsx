import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  DollarSign,
  Download,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  CreditCard,
  Building2,
  AlertCircle,
  Edit2,
  Trash2,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { PaySalaryModal, type SalaryItem } from './PaySalaryModal';
import { useAuthStore } from '@/stores/auth';
import { syncFinanceQueries } from '../financeSync';

export function SalaryManagementTab() {
  const qc = useQueryClient();
  const isCeo = useAuthStore((s) => s.user?.role === 'ceo');

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // "YYYY-MM"
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState<SalaryItem | null>(null);

  // Fetch salaries from backend
  const { data: salaryData, isLoading } = useQuery({
    queryKey: ['finance-salaries', period, statusFilter],
    queryFn: async () => {
      const params: any = { period };
      if (statusFilter !== 'all') params.status = statusFilter;
      return (await api.get('/finance/salaries/records', { params })).data.data;
    },
  });

  const summary = salaryData?.summary || { totalPaid: 0, totalPending: 0, totalEmployees: 0 };
  const items: any[] = salaryData?.items || [];

  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true;
    const name = item.employee?.name?.toLowerCase() || '';
    const code = item.employee?.employeeId?.toLowerCase() || '';
    const q = search.toLowerCase();
    return name.includes(q) || code.includes(q);
  });

  const handleOpenPay = (item?: any) => {
    if (item) {
      setSelectedSalary({
        payrollId: item._id,
        employeeId: item.employee?._id,
        employeeName: item.employee?.name,
        employeeCode: item.employee?.employeeId,
        department: item.employee?.department,
        period: item.period || period,
        basicSalary: item.base || 0,
        allowances: item.stipend || 0,
        bonuses: item.incentive || 0,
        deductions: item.deductions || 0,
        netSalary: item.net || 0,
        paymentStatus: item.status === 'disbursed' ? 'paid' : 'pending',
        paymentDate: item.paidOn || item.paidAt,
        paymentMethod: item.paymentMethod,
        transactionRef: item.transactionRef,
        notes: item.notes,
      });
    } else {
      setSelectedSalary(null);
    }
    setPayModalOpen(true);
  };

  const handleDownloadSlip = async (id: string, empName: string, itemPeriod: string) => {
    try {
      toast.info('Generating official PDF salary slip…');
      const res = await api.get(`/finance/salaries/${id}/slip`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Payslip_${empName.replace(/\s+/g, '_')}_${itemPeriod}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Salary slip downloaded');
    } catch (err: any) {
      toast.error(getErrorMessage(err) || 'Failed to generate salary slip');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/salaries/${id}`)).data,
    onSuccess: async () => {
      toast.success('Salary record deleted and ledger adjusted');
      await syncFinanceQueries(qc);
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) || 'Failed to delete salary record');
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-[var(--radius)] border border-[var(--teal-border)] bg-gradient-to-br from-[var(--teal-soft)] via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--teal-text)]">
              Salary paid
            </span>
            <CheckCircle2 className="h-4 w-4 text-[var(--teal-text)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(summary.totalPaid)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">{period} · counted in expenses</div>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--orange-border)] bg-gradient-to-br from-[var(--orange-soft)] via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--orange-text)]">
              Pending liability
            </span>
            <Clock className="h-4 w-4 text-[var(--orange-text)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{formatCurrency(summary.totalPending)}</div>
          <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Outstanding payroll obligations</div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-[var(--radius)] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-sky-700">Employees</div>
            <div className="mt-2 text-2xl font-bold text-[var(--fg)]">{summary.totalEmployees}</div>
            <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Active payroll count</div>
          </div>
          <Button size="sm" variant="teal" className="shrink-0 gap-1 text-xs" onClick={() => handleOpenPay()}>
            <Plus className="h-4 w-4" /> Process salary
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)] md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-[var(--fg-secondary)]" />
            <Input type="month" className="w-40 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="w-36">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="disbursed">Paid</option>
              <option value="approved">Pending</option>
              <option value="draft">Draft</option>
            </Select>
          </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-secondary)]" />
          <Input
            className="pl-9 text-xs"
            placeholder="Search employee name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Salary Records Table */}
      <TableShell>
        {isLoading && <div className="p-8 text-center text-sm text-[var(--fg-secondary)]">Loading payroll records…</div>}

        {!isLoading && filteredItems.length === 0 && (
          <EmptyState
            title="No salary records found"
            description={`No payroll entries recorded for ${period}. Click below to process salaries.`}
            action={<Button onClick={() => handleOpenPay()}>+ Record Employee Salary</Button>}
          />
        )}

        {!isLoading && filteredItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Month</th>
                  <th className="!text-right">Basic</th>
                  <th className="!text-right">Allowances</th>
                  <th className="!text-right">Bonuses</th>
                  <th className="!text-right">Deductions</th>
                  <th className="!text-right">Net Salary</th>
                  <th>Status</th>
                  <th>Payment Info</th>
                  <th className="!text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const emp = item.employee;
                  const isPaid = item.status === 'disbursed';

                  return (
                    <tr key={item._id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      {/* Employee details */}
                      <td>
                        <div className="font-semibold text-[var(--fg-primary)]">{emp?.name || 'Unknown'}</div>
                        <div className="text-[11px] font-mono text-[var(--fg-muted)]">
                          {emp?.employeeId || emp?.role || 'EMP'}
                        </div>
                      </td>

                      {/* Period */}
                      <td>
                        <span className="text-xs font-mono text-[var(--fg-secondary)]">{item.period}</span>
                      </td>

                      {/* Basic */}
                      <td className="!text-right text-xs">{formatCurrency(item.base || 0)}</td>

                      {/* Allowances */}
                      <td className="!text-right text-xs font-medium text-[var(--teal-text)]">
                        +{formatCurrency(item.stipend || 0)}
                      </td>

                      <td className="!text-right text-xs font-medium text-[var(--teal-text)]">
                        +{formatCurrency(item.incentive || 0)}
                      </td>

                      <td className="!text-right text-xs font-medium text-rose-700">
                        -{formatCurrency(item.deductions || 0)}
                      </td>

                      <td className="!text-right text-sm font-bold text-[var(--fg)]">
                        {formatCurrency(item.net || 0)}
                      </td>

                      <td>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            isPaid
                              ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-text)]'
                              : 'border-[var(--orange-border)] bg-[var(--orange-soft)] text-[var(--orange-text)]'
                          }`}
                        >
                          {isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>

                      {/* Payment info */}
                      <td>
                        {isPaid ? (
                          <div className="text-xs">
                            <div className="text-[var(--fg)]">{item.paidOn || item.paidAt ? formatDate(item.paidOn || item.paidAt) : '—'}</div>
                            <div className="text-[10px] text-[var(--fg-muted)] truncate max-w-[120px]">
                              {item.paymentMethod} {item.transactionRef ? `(${item.transactionRef})` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--fg-muted)]">Unpaid</span>
                        )}
                      </td>

                      <td className="!text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!isPaid ? (
                            <Button
                              size="sm"
                              variant="teal"
                              className="h-7 px-2.5 text-[11px]"
                              onClick={() => handleOpenPay(item)}
                            >
                              Pay Now
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-[var(--teal-border)] px-2 text-[11px] text-[var(--teal-text)] hover:bg-[var(--teal-soft)]"
                              onClick={() => handleDownloadSlip(item._id, emp?.name || 'Employee', item.period)}
                              title="Download Official Pay Slip PDF"
                            >
                              <Download className="h-3 w-3 mr-1" /> Slip
                            </Button>
                          )}

                          {isCeo ? (
                            <>
                              <button
                                type="button"
                                className="rounded p-1 text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
                                onClick={() => handleOpenPay(item)}
                                title="Update salary (CEO)"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-[var(--fg-secondary)] transition-colors hover:bg-rose-50 hover:text-rose-700"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Delete salary for ${emp?.name || 'employee'} (${item.period})?` +
                                        (isPaid
                                          ? ' The linked expense and bank balance will be reversed.'
                                          : '')
                                    )
                                  ) {
                                    deleteMutation.mutate(item._id);
                                  }
                                }}
                                title="Delete salary (CEO)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      {/* Pay / Edit Salary Modal */}
      <PaySalaryModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        salaryItem={selectedSalary}
      />
    </div>
  );
}
