import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Tag,
  Plus,
  Trash2,
  CheckCircle2,
  Layers,
  Edit2,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Input';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FinanceCategoriesModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [form, setForm] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense',
    description: '',
    color: '#0d9488',
  });

  const { data: catData, isLoading } = useQuery({
    queryKey: ['finance-categories-full'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return (await api.post('/finance/categories', {
        name: form.name.trim(),
        type: activeTab,
        description: form.description || undefined,
        color: form.color || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success('Custom category created');
      setForm({ name: '', type: activeTab, description: '', color: '#0d9488' });
      qc.invalidateQueries({ queryKey: ['finance-categories-full'] });
      qc.invalidateQueries({ queryKey: ['finance-categories'] });
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to create category');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/finance/categories/${id}`)).data;
    },
    onSuccess: () => {
      toast.success('Category removed');
      qc.invalidateQueries({ queryKey: ['finance-categories-full'] });
      qc.invalidateQueries({ queryKey: ['finance-categories'] });
    },
    onError: (err: any) => {
      toast.error(getErrorMessage(err) || 'Failed to delete category');
    },
  });

  const customCategories = (catData?.custom || []).filter((c: any) => c.type === activeTab);
  const defaultList = activeTab === 'income' ? catData?.incomeCategories || [] : catData?.expenseCategories || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">Manage Financial Categories</div>
            <div className="text-xs text-[var(--fg-secondary)] font-normal">
              Define custom categories for revenue, expenses, and bills
            </div>
          </div>
        </div>
      }
      variant="dialog"
      size="md"
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Type Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          <button
            type="button"
            className={`py-1.5 px-3 rounded-lg font-medium transition-all ${
              activeTab === 'expense'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setActiveTab('expense')}
          >
            Expense Categories
          </button>
          <button
            type="button"
            className={`py-1.5 px-3 rounded-lg font-medium transition-all ${
              activeTab === 'income'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
            }`}
            onClick={() => setActiveTab('income')}
          >
            Income Categories
          </button>
        </div>

        {/* Add Category Form */}
        <div className="p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="font-semibold text-[var(--fg-primary)]">Add Custom Category</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g. Legal Fees, Server Costs, Cloudflare"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <Button
              variant="teal"
              disabled={!form.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        {/* Categories List */}
        <div className="space-y-2">
          <div className="font-semibold text-[var(--fg-secondary)] uppercase tracking-wider text-[11px]">
            Active {activeTab} Categories
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {/* Custom Categories First */}
            {customCategories.map((cat: any) => (
              <div
                key={cat._id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-sunken)]/60 border border-[var(--border-subtle)] hover:border-[var(--border)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cat.color || '#0d9488' }}
                  />
                  <span className="font-medium text-[var(--fg-primary)]">{cat.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-400">
                    Custom
                  </span>
                </div>
                <button
                  type="button"
                  className="p-1 rounded text-[var(--fg-muted)] hover:text-rose-400 transition-colors"
                  onClick={() => {
                    if (confirm(`Remove custom category "${cat.name}"?`)) {
                      deleteMutation.mutate(cat._id);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Default System Categories */}
            {defaultList.map((name: string) => {
              const isDefault = !customCategories.some((c: any) => c.name === name);
              if (!isDefault) return null;
              return (
                <div
                  key={name}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    <span className="text-[var(--fg-secondary)]">{name}</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">Default</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
