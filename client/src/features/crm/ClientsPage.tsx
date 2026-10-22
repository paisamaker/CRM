import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Plus, Building2, Mail, Briefcase, Calendar, UserCheck } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, Card, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input, Label } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';

export function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', company: '', email: '', industry: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: async () => (await api.get('/clients', { params: { search, limit: 50 } })).data.data,
  });

  const create = useMutation({
    mutationFn: async () => api.post('/clients', form),
    onSuccess: () => {
      toast.success('Client added successfully');
      setOpen(false);
      setForm({ name: '', company: '', email: '', industry: '' });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--teal-border)] bg-gradient-to-r from-[var(--teal-soft)] via-[var(--purple-soft)] to-[var(--orange-soft)] p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-100/90 px-3 py-0.5 text-xs font-bold text-teal-800">
                <Building2 className="h-3.5 w-3.5" />
                Agency CRM
              </span>
              <span className="text-xs text-[var(--fg-muted)]">Active Accounts</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--fg)]">
              Client Portfolio &amp; Brand Partners
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">
              Manage enterprise clients, brand campaign accounts, and designated relationship managers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--fg-muted)]" />
              <Input
                className="w-56 pl-9 text-xs"
                placeholder="Search brands & clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" variant="teal" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={`sk-${i}`} className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </Card>
          ))}
        {!isLoading &&
          (data?.items || []).map((c: {
          _id: string;
          name: string;
          company: string;
          status: string;
          industry?: string;
          email?: string;
          onboardedAt?: string;
          owner?: { name?: string };
        }) => (
          <Card
            key={c._id}
            className="group relative overflow-hidden border-[var(--border)] transition-all hover:border-[var(--teal-border)] hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={c.company || c.name} className="h-11 w-11 text-base shadow-xs" />
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-[var(--fg)]">{c.company}</div>
                  <div className="truncate text-xs font-medium text-[var(--fg-secondary)]">{c.name}</div>
                </div>
              </div>
              <Badge tone={statusTone(c.status)} className="text-[10px] !px-2">
                {c.status}
              </Badge>
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--divider)] pt-3 text-xs">
              {c.industry ? (
                <div className="flex items-center gap-2 text-[var(--fg-secondary)]">
                  <Briefcase className="h-3.5 w-3.5 text-[var(--teal)]" />
                  <span>{c.industry}</span>
                </div>
              ) : null}
              {c.email ? (
                <div className="flex items-center gap-2 text-[var(--fg-secondary)]">
                  <Mail className="h-3.5 w-3.5 text-[var(--purple)]" />
                  <span className="truncate">{c.email}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-[11px] text-[var(--fg-muted)] pt-1">
                <span className="flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5 text-[var(--orange)]" />
                  Owner: {c.owner?.name || 'Unassigned'}
                </span>
                <span>{c.onboardedAt ? formatDate(c.onboardedAt) : 'Active'}</span>
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && !data?.items?.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-[var(--fg-muted)] opacity-50" />
            <h3 className="mt-3 text-sm font-bold text-[var(--fg)]">No clients found</h3>
            <p className="text-xs text-[var(--fg-muted)]">Add your first agency client to get started</p>
          </div>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add New Client Account"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.company || !form.name || create.isPending}
              onClick={() => create.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white"
            >
              {create.isPending ? 'Saving…' : 'Create Client'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div>
            <Label required>Company / Brand Name</Label>
            <Input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="e.g. Acme Lifestyle"
            />
          </div>
          <div>
            <Label required>Key Contact Person</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Sarah Jenkins"
            />
          </div>
          <div>
            <Label>Contact Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="sarah@acme.com"
            />
          </div>
          <div>
            <Label>Industry</Label>
            <Input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="e.g. FMCG, Beauty, Gaming"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
