import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Layers,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

type CatTab = 'expense' | 'income' | 'payment_request';

export function FinanceCategoriesModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<CatTab>('expense');
  const [name, setName] = useState('');

  const { data: catData, isLoading } = useQuery({
    queryKey: ['finance-categories-full'],
    queryFn: async () => (await api.get('/finance/categories')).data.data,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post('/finance/categories', {
          name: name.trim(),
          type: activeTab,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success('Category created');
      setName('');
      qc.invalidateQueries({ queryKey: ['finance-categories-full'] });
      qc.invalidateQueries({ queryKey: ['finance-categories'] });
    },
    onError: (err: unknown) => {
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
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) || 'Failed to delete category');
    },
  });

  const items: Array<{
    _id: string;
    name: string;
    type: string;
    isDefault?: boolean;
    isActive?: boolean;
  }> = (catData?.items || []).filter(
    (c: { type: string; isActive?: boolean }) => c.type === activeTab && c.isActive !== false
  );

  const defaultNames: string[] =
    activeTab === 'income'
      ? catData?.income || []
      : activeTab === 'expense'
        ? catData?.expense || []
        : catData?.paymentRequest || [];

  const customItems = items.filter((c) => !c.isDefault);
  const defaultOnly = defaultNames.filter(
    (n) => !customItems.some((c) => c.name.toLowerCase() === n.toLowerCase())
  );

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
              Income, expenses, and payment request types
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
        <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)]">
          {(
            [
              ['expense', 'Expense'],
              ['income', 'Income'],
              ['payment_request', 'Payment Req.'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                activeTab === id
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-deep)] border border-[var(--border)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-2.5">
          <div className="font-semibold text-[var(--fg)]">Add category</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder={
                  activeTab === 'payment_request'
                    ? 'e.g. Contractor Fee, Rent'
                    : 'e.g. Legal Fees, Server Costs'
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-[var(--fg-secondary)] uppercase tracking-wider text-[11px]">
            Active {activeTab.replace('_', ' ')} categories
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            {isLoading ? (
              <div className="text-[var(--fg-muted)] py-4 text-center">Loading…</div>
            ) : null}

            {customItems.map((cat) => (
              <div
                key={cat._id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-sunken)]/60 border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <span className="font-medium text-[var(--fg)]">{cat.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600">
                    Custom
                  </span>
                </div>
                <button
                  type="button"
                  className="p-1 rounded text-[var(--fg-muted)] hover:text-rose-500"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Remove category?',
                      description: `Remove "${cat.name}"? Existing records keep their category text.`,
                      confirmLabel: 'Remove',
                      tone: 'danger',
                    });
                    if (ok) deleteMutation.mutate(cat._id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {defaultOnly.map((catName) => (
              <div
                key={catName}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-[var(--fg-secondary)]">{catName}</span>
                  <span className="text-[10px] text-[var(--fg-muted)]">Default</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
