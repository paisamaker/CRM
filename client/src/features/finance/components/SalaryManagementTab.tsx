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
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { PaySalaryModal, type SalaryItem } from './PaySalaryModal';

export function SalaryManagementTab() {
  const qc = useQueryClient();

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
      return (await api.get('/finance/salaries', { params })).data.data;
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
        paymentDate: item.paidAt,
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

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Total Salary Paid ({period})</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(summary.totalPaid)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Disbursed to employees & counted in expenses</div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400">Pending Salary Liability</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
            {formatCurrency(summary.totalPending)}
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-1">Outstanding payroll obligations</div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-blue-400">Payroll Employees</div>
            <div className="text-2xl font-bold mt-2 text-[var(--fg-primary)]">
              {summary.totalEmployees}
            </div>
            <div className="text-[11px] text-[var(--fg-muted)] mt-1">Active team payroll count</div>
          </div>
          <Button
            size="sm"
            variant="teal"
            className="text-xs gap-1 shadow-md shadow-teal-500/10"
            onClick={() => handleOpenPay()}
          >
            <Plus className="w-4 h-4" /> Process Salary
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[var(--fg-muted)]" />
            <Input
              type="month"
              className="w-40 text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>

          {/* Status selector */}
          <div className="w-36">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="disbursed">Paid (Disbursed)</option>
              <option value="approved">Pending</option>
              <option value="draft">Draft</option>
            </Select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-[var(--fg-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
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
                      <td className="!text-right text-xs text-emerald-400">
                        +{formatCurrency(item.stipend || 0)}
                      </td>

                      {/* Bonuses */}
                      <td className="!text-right text-xs text-emerald-400">
                        +{formatCurrency(item.incentive || 0)}
                      </td>

                      {/* Deductions */}
                      <td className="!text-right text-xs text-rose-400">
                        -{formatCurrency(item.deductions || 0)}
                      </td>

                      {/* Net Salary */}
                      <td className="!text-right font-bold text-sm text-[var(--fg-primary)]">
                        {formatCurrency(item.net || 0)}
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            isPaid
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {isPaid ? 'Paid' : 'Pending Liability'}
                        </span>
                      </td>

                      {/* Payment info */}
                      <td>
                        {isPaid ? (
                          <div className="text-xs">
                            <div className="text-[var(--fg-primary)]">{formatDate(item.paidAt)}</div>
                            <div className="text-[10px] text-[var(--fg-muted)] truncate max-w-[120px]">
                              {item.paymentMethod} {item.transactionRef ? `(${item.transactionRef})` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--fg-muted)]">Unpaid</span>
                        )}
                      </td>

                      {/* Actions */}
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
                              className="h-7 px-2 text-[11px] text-teal-400 border-teal-500/30 hover:bg-teal-500/10"
                              onClick={() => handleDownloadSlip(item._id, emp?.name || 'Employee', item.period)}
                              title="Download Official Pay Slip PDF"
                            >
                              <Download className="w-3 h-3 mr-1" /> Slip
                            </Button>
                          )}
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
