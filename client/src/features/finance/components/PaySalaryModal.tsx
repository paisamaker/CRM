import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  DollarSign,
  Calendar,
  CreditCard,
  Building2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

export interface SalaryItem {
  _id?: string;
  payrollId?: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string;
  period: string; // "2026-10" or "October 2026"
  basicSalary: number;
  allowances: number;
  bonuses: number;
  deductions: number;
  netSalary: number;
  paymentStatus: 'pending' | 'paid';
  paymentDate?: string;
  paymentMethod?: string;
  transactionRef?: string;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  salaryItem?: SalaryItem | null;
}

export function PaySalaryModal({ open, onClose, salaryItem }: Props) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    employeeId: '',
    period: new Date().toISOString().slice(0, 7), // "2026-10"
    basicSalary: '',
    allowances: '0',
    bonuses: '0',
    deductions: '0',
    paymentStatus: 'paid' as 'pending' | 'paid',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Bank Transfer',
    bankAccountId: '',
    transactionRef: '',
    notes: '',
  });

  // Fetch employees
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users', { params: { limit: 100 } })).data.data,
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => (await api.get('/finance/bank-accounts')).data.data || [],
  });

  const employees = (usersData?.users || []).filter((u: any) => u.isActive !== false);

  useEffect(() => {
    if (open) {
      if (salaryItem) {
        setForm({
          employeeId: salaryItem.employeeId || '',
          period: salaryItem.period || new Date().toISOString().slice(0, 7),
          basicSalary: String(salaryItem.basicSalary ?? ''),
          allowances: String(salaryItem.allowances ?? 0),
          bonuses: String(salaryItem.bonuses ?? 0),
          deductions: String(salaryItem.deductions ?? 0),
          paymentStatus: salaryItem.paymentStatus || 'paid',
          paymentDate: salaryItem.paymentDate
            ? new Date(salaryItem.paymentDate).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          paymentMethod: salaryItem.paymentMethod || 'Bank Transfer',
          bankAccountId: bankAccounts?.[0]?._id || '',
          transactionRef: salaryItem.transactionRef || '',
          notes: salaryItem.notes || '',
        });
      } else {
        setForm({
          employeeId: employees[0]?._id || '',
          period: new Date().toISOString().slice(0, 7),
          basicSalary: '',
          allowances: '0',
          bonuses: '0',
          deductions: '0',
          paymentStatus: 'paid',
          paymentDate: new Date().toISOString().slice(0, 10),
          paymentMethod: 'Bank Transfer',
          bankAccountId: bankAccounts?.[0]?._id || '',
          transactionRef: '',
          notes: '',
        });
      }
    }
  }, [open, salaryItem, employees.length, bankAccounts]);

  const basic = Number(form.basicSalary) || 0;
  const allowances = Number(form.allowances) || 0;
  const bonuses = Number(form.bonuses) || 0;
  const deductions = Number(form.deductions) || 0;
  const calculatedNet = Math.max(0, basic + allowances + bonuses - deductions);

  const payMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        payrollId: salaryItem?.payrollId || salaryItem?._id || undefined,
        employeeId: form.employeeId,
        period: form.period,
        basicSalary: basic,
        allowances,
        bonuses,
        deductions,
        paymentStatus: form.paymentStatus,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.bankAccountId || undefined,
        transactionRef: form.transactionRef || undefined,
        notes: form.notes || undefined,
      };

      return (await api.post('/finance/salaries/record-payment', payload)).data;
    },
    onSuccess: () => {
      toast.success(
        form.paymentStatus === 'paid'
          ? 'Salary marked as paid and expense recorded'
          : 'Salary recorded as pending payroll liability'
      );
      qc.invalidateQueries({ queryKey: ['finance-salaries'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['finance-transactions'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['finance-dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-reports'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to record salary');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{salaryItem ? 'Process Employee Salary' : 'Record Salary Entry'}</div>
            <div className="text-xs text-[var(--fg-secondary)] font-normal">
              Compute net salary, mark paid or pending, and update company financial summaries
            </div>
          </div>
        </div>
      }
      variant="dialog"
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[var(--fg-secondary)]">
            Net Salary: <span className="font-semibold text-teal-400">₹{calculatedNet.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={payMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="teal"
              disabled={!form.employeeId || basic <= 0 || payMutation.isPending}
              onClick={() => payMutation.mutate()}
            >
              {payMutation.isPending ? 'Processing…' : form.paymentStatus === 'paid' ? 'Disburse & Mark Paid' : 'Save as Pending'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-sm">
        {/* Employee & Month Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Select Employee *</Label>
            <Select
              value={form.employeeId}
              disabled={!!salaryItem?.employeeId}
              onChange={(e) => {
                const emp = employees.find((u: any) => u._id === e.target.value);
                setForm({
                  ...form,
                  employeeId: e.target.value,
                  basicSalary: emp?.compensation?.baseSalary ? String(emp.compensation.baseSalary) : form.basicSalary,
                });
              }}
            >
              <option value="">Select Employee</option>
              {employees.map((emp: any) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.employeeId || emp.role})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Salary Month / Period *</Label>
            <Input
              type="month"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            />
          </div>
        </div>

        {/* Salary Breakdown Formula Display */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-3">
          <div className="text-xs font-semibold text-[var(--fg-secondary)] flex items-center justify-between">
            <span>SALARY COMPONENTS</span>
            <span className="font-mono text-[11px] text-[var(--accent)]">
              Net = Basic + Allowances + Bonuses - Deductions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Basic Salary (INR) *</Label>
              <Input
                type="number"
                min="0"
                step="100"
                placeholder="50000"
                value={form.basicSalary}
                onChange={(e) => setForm({ ...form, basicSalary: e.target.value })}
              />
            </div>

            <div>
              <Label>Allowances (HRA / Medical)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={form.allowances}
                onChange={(e) => setForm({ ...form, allowances: e.target.value })}
              />
            </div>

            <div>
              <Label>Performance Bonuses / Incentives</Label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={form.bonuses}
                onChange={(e) => setForm({ ...form, bonuses: e.target.value })}
              />
            </div>

            <div>
              <Label>Deductions (TDS / PF / Leaves)</Label>
              <Input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={form.deductions}
                onChange={(e) => setForm({ ...form, deductions: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
            <span className="font-medium text-[var(--fg-muted)]">Calculated Net Pay:</span>
            <span className="font-bold text-base text-teal-400">
              {formatCurrency(calculatedNet)}
            </span>
          </div>
        </div>

        {/* Status Toggle */}
        <div className="grid grid-cols-2 gap-3 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          <button
            type="button"
            className={`py-2 px-3 text-center rounded-lg font-medium text-xs transition-all ${
              form.paymentStatus === 'paid'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setForm({ ...form, paymentStatus: 'paid' })}
          >
            Mark as Paid (Disburse)
          </button>
          <button
            type="button"
            className={`py-2 px-3 text-center rounded-lg font-medium text-xs transition-all ${
              form.paymentStatus === 'pending'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setForm({ ...form, paymentStatus: 'pending' })}
          >
            Mark as Pending (Liability)
          </button>
        </div>

        {/* Payment Details (Shown when paid) */}
        {form.paymentStatus === 'paid' && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                />
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                >
                  <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="UPI">UPI</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </Select>
              </div>
            </div>

            {bankAccounts && bankAccounts.length > 0 && (
              <div>
                <Label>Disburse from Bank Account</Label>
                <Select
                  value={form.bankAccountId}
                  onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
                >
                  <option value="">Select Bank Account</option>
                  {bankAccounts.map((b: any) => (
                    <option key={b._id} value={b._id}>
                      {b.bankName} - {b.accountNumber} ({formatCurrency(b.currentBalance ?? b.balance ?? 0)})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <Label>Transaction Reference / UTR</Label>
              <Input
                placeholder="e.g. UTR-SALARY-202610-098"
                value={form.transactionRef}
                onChange={(e) => setForm({ ...form, transactionRef: e.target.value })}
              />
            </div>
          </div>
        )}

        <div>
          <Label>Notes / Remarks</Label>
          <Input
            placeholder="e.g. Regular monthly payroll disbursement"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}
