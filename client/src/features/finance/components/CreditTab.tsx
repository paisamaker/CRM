import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  RefreshCw,
  Landmark,
  Wallet,
  Eye,
  Building2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge, statusTone } from '@/components/ui/Badge';
import { TableShell, EmptyState } from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { CreditFacilityModal } from './CreditFacilityModal';
import { CreditEntryModal } from './CreditEntryModal';
import { CreditFacilityDetailModal } from './CreditFacilityDetailModal';
import type {
  CreditDirection,
  CreditEntryType,
  CreditFacilityItem,
  CreditKind,
  CreditSummary,
} from './creditTypes';

type ListFilter = 'all' | 'lent' | 'borrowed' | 'loan';

export function CreditTab() {
  const qc = useQueryClient();
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);

  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<CreditFacilityItem | null>(null);
  const [defaultKind, setDefaultKind] = useState<CreditKind>('credit');
  const [defaultDirection, setDefaultDirection] = useState<CreditDirection | undefined>(undefined);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryFacility, setEntryFacility] = useState<CreditFacilityItem | null>(null);
  const [entryType, setEntryType] = useState<CreditEntryType>('repayment');

  const { data: summary } = useQuery({
    queryKey: ['credit-summary'],
    queryFn: async () => (await api.get('/finance/credit/summary')).data.data as CreditSummary,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['credit-facilities', listFilter, statusFilter, search, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (listFilter === 'loan') params.kind = 'loan';
      if (listFilter === 'lent') {
        params.kind = 'credit';
        params.direction = 'lent';
      }
      if (listFilter === 'borrowed') {
        params.kind = 'credit';
        params.direction = 'borrowed';
      }
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      return (await api.get('/finance/credit/facilities', { params })).data.data as {
        items: CreditFacilityItem[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
    },
  });

  const items = data?.items || [];
  const pagination = data?.pagination;

  const openCreate = (kind: CreditKind = 'credit', direction?: CreditDirection) => {
    setEditingFacility(null);
    setDefaultKind(kind);
    setDefaultDirection(direction);
    setFacilityModalOpen(true);
  };

  const openEdit = (f: CreditFacilityItem) => {
    setEditingFacility(f);
    setDefaultKind(f.kind || 'credit');
    setDefaultDirection(f.direction);
    setFacilityModalOpen(true);
  };

  const openDetail = (f: CreditFacilityItem) => {
    setDetailId(f._id);
    setDetailOpen(true);
  };

  const openEntry = (f: CreditFacilityItem, type: CreditEntryType = 'repayment') => {
    setEntryFacility(f);
    setEntryType(type);
    setEntryOpen(true);
  };

  const deleteFacility = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/finance/credit/facilities/${id}`, { params: { force: true } })).data,
    onSuccess: () => {
      toast.success('Facility deleted');
      qc.invalidateQueries({ queryKey: ['credit-facilities'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-facility'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const confirmDelete = async (f: CreditFacilityItem) => {
    const ok = await confirmDialog({
      title: `Delete ${f.kind === 'loan' ? 'loan' : 'credit'}?`,
      description:
        'Removes this facility and all of its credit ledger entries. This does not affect main finance income or expenses.',
      detail: (
        <span className="font-semibold text-slate-900">
          {f.title} · CR-{f.facilityNumber} · {formatCurrency(f.outstandingBalance)} outstanding
        </span>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) deleteFacility.mutate(f._id);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['credit-facilities'] }),
        qc.invalidateQueries({ queryKey: ['credit-summary'] }),
        qc.invalidateQueries({ queryKey: ['credit-facility'] }),
      ]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
        <strong>Separate credit &amp; loan ledger.</strong> These amounts are <strong>not</strong>{' '}
        counted in main Finance income, expenses, bank balance, or P&amp;L.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-800">
              <ArrowUpRight className="h-3.5 w-3.5" /> Lent
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg)]">
              {formatCurrency(summary?.creditLentOutstanding || 0)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">
              Credit you gave — they owe you
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 border-teal-200 text-xs text-teal-800 hover:bg-teal-50"
            onClick={() => openCreate('credit', 'lent')}
          >
            <Plus className="h-3.5 w-3.5" /> Lent
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius)] border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-700">
              <ArrowDownLeft className="h-3.5 w-3.5" /> Borrow
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg)]">
              {formatCurrency(summary?.creditBorrowedOutstanding || 0)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">
              Credit you took — you owe them
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 border-rose-200 text-xs text-rose-700 hover:bg-rose-50"
            onClick={() => openCreate('credit', 'borrowed')}
          >
            <Plus className="h-3.5 w-3.5" /> Borrow
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius)] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-4 shadow-[var(--shadow-sm)]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-800">
              <Building2 className="h-3.5 w-3.5" /> Loan
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg)]">
              {formatCurrency(summary?.loanOutstanding || 0)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--fg-secondary)]">Formal loans with terms</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 border-violet-200 text-xs text-violet-800 hover:bg-violet-50"
            onClick={() => openCreate('loan')}
          >
            <Plus className="h-3.5 w-3.5" /> Loan
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-gradient-to-br from-[var(--bg-subtle)] via-white to-white p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--fg-secondary)]">
              <Wallet className="h-3.5 w-3.5" /> Facilities
            </div>
            <div className="mt-1 text-2xl font-bold text-[var(--fg)]">
              {summary?.activeFacilities ?? 0}
              <span className="ml-1 text-sm font-medium text-[var(--fg-muted)]">
                active / {summary?.totalFacilities ?? 0}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              Sync
            </Button>
            <Button size="sm" className="gap-1 text-xs" onClick={() => openCreate('credit')}>
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-stretch justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)] md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'lent', label: 'Lent' },
                { id: 'borrowed', label: 'Borrow' },
                { id: 'loan', label: 'Loan' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  listFilter === opt.id
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]'
                )}
                onClick={() => {
                  setListFilter(opt.id);
                  setPage(1);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Select
            className="h-9 w-36 text-xs"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="defaulted">Defaulted</option>
          </Select>
        </div>
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
          <Input
            className="h-9 pl-8 text-xs"
            placeholder="Search title, party, ref…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <TableShell>
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[var(--fg-muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No credit or loans yet"
            description="Add Lent credit, Borrow credit, or a formal Loan — each tracked separately."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openCreate('credit', 'lent')}>
                  <Plus className="h-3.5 w-3.5" /> Lent
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openCreate('credit', 'borrowed')}>
                  <Plus className="h-3.5 w-3.5" /> Borrow
                </Button>
                <Button size="sm" className="gap-1" onClick={() => openCreate('loan')}>
                  <Plus className="h-3.5 w-3.5" /> Loan
                </Button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
                  <th className="px-4 py-3 font-semibold">Facility</th>
                  <th className="px-4 py-3 font-semibold">Party</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold text-right">Principal</th>
                  <th className="px-4 py-3 font-semibold text-right">Outstanding</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map((f) => (
                  <tr key={f._id} className="hover:bg-[var(--bg-subtle)]/60">
                    <td className="px-4 py-3">
                      <button type="button" className="text-left" onClick={() => openDetail(f)}>
                        <div className="font-medium text-[var(--fg)] hover:text-[var(--brand)]">
                          {f.title}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--fg-muted)]">
                          CR-{f.facilityNumber}
                          {f.hasInterest && f.interestRate != null ? ` · ${f.interestRate}%` : ' · No interest'}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-secondary)]">{f.partyName}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {f.kind === 'loan' ? (
                          <Badge tone="purple">Loan</Badge>
                        ) : f.direction === 'lent' ? (
                          <Badge tone="teal">Lent</Badge>
                        ) : (
                          <Badge tone="danger">Borrow</Badge>
                        )}
                        {f.kind !== 'loan' ? (
                          <span className="text-[10px] text-[var(--fg-muted)]">Credit</span>
                        ) : (
                          <span className="text-[10px] text-[var(--fg-muted)]">
                            {f.direction === 'lent' ? 'Lent' : 'Borrowed'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(f.principalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--fg)]">
                      {formatCurrency(f.outstandingBalance)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(f.status)}>{f.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-secondary)]">
                      {f.dueDate ? formatDate(f.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded p-1.5 text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
                          title="View"
                          onClick={() => openDetail(f)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {f.status !== 'closed' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => openEntry(f, 'repayment')}
                          >
                            <Landmark className="h-3 w-3" /> Entry
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete"
                          disabled={deleteFacility.isPending}
                          onClick={() => confirmDelete(f)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--fg-secondary)]">
            <span>
              Page {pagination.page} of {pagination.pages} · {pagination.total} facilities
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </TableShell>

      <CreditFacilityModal
        open={facilityModalOpen}
        onClose={() => {
          setFacilityModalOpen(false);
          setEditingFacility(null);
          setDefaultDirection(undefined);
        }}
        editing={editingFacility}
        defaultKind={defaultKind}
        defaultDirection={defaultDirection}
      />

      <CreditEntryModal
        open={entryOpen}
        onClose={() => {
          setEntryOpen(false);
          setEntryFacility(null);
        }}
        facility={entryFacility}
        defaultType={entryType}
      />

      <CreditFacilityDetailModal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
        facilityId={detailId}
        onEdit={(f) => {
          setDetailOpen(false);
          openEdit(f);
        }}
        onAddEntry={(f, type) => {
          openEntry(f, type || 'repayment');
        }}
      />
    </div>
  );
}
