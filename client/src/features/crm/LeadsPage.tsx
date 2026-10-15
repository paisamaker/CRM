import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Target, CheckCircle2, ArrowRight, DollarSign } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const stageConfig: Record<string, { label: string; tone: string; border: string; bg: string }> = {
  lead: { label: 'New Inbound', tone: 'purple', border: 'border-t-[var(--purple)]', bg: 'bg-[var(--purple-soft)]/50' },
  contacted: { label: 'Contacted', tone: 'info', border: 'border-t-blue-500', bg: 'bg-blue-50/50' },
  proposal: { label: 'Proposal Sent', tone: 'orange', border: 'border-t-[var(--orange)]', bg: 'bg-[var(--orange-soft)]/50' },
  negotiation: { label: 'Negotiation', tone: 'warning', border: 'border-t-amber-500', bg: 'bg-amber-50/50' },
  won: { label: 'Closed Won', tone: 'teal', border: 'border-t-[var(--teal)]', bg: 'bg-[var(--teal-soft)]/50' },
  lost: { label: 'Closed Lost', tone: 'default', border: 'border-t-slate-400', bg: 'bg-slate-50/50' },
};

const stages = ['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];

export function LeadsPage() {
  const canCreate = useAuthStore((s) => s.can('leads', 'create'));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    source: 'inbound',
    value: '',
    stage: 'lead',
  });

  const { data } = useQuery({
    queryKey: ['leads-board'],
    queryFn: async () => (await api.get('/leads/board')).data.data,
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/leads', {
        ...form,
        value: Number(form.value || 0),
        email: form.email || undefined,
      }),
    onSuccess: () => {
      toast.success('Lead created successfully');
      setOpen(false);
      setForm({ name: '', company: '', email: '', source: 'inbound', value: '', stage: 'lead' });
      qc.invalidateQueries({ queryKey: ['leads-board'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => api.patch(`/leads/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads-board'] }),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const convert = useMutation({
    mutationFn: async (id: string) => api.post(`/leads/${id}/convert`),
    onSuccess: () => {
      toast.success('Lead successfully converted to Client Account!');
      qc.invalidateQueries({ queryKey: ['leads-board'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--orange-border)] bg-gradient-to-r from-[var(--teal-soft)] via-[var(--purple-soft)] to-[var(--orange-soft)] p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100/90 px-3 py-0.5 text-xs font-bold text-orange-800">
                <Target className="h-3.5 w-3.5" />
                Pipeline Kanban
              </span>
              <span className="text-xs text-[var(--fg-muted)]">Agency Opportunity Flow</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--fg)]">
              Deal Pipeline &amp; Conversion Board
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">
              Move deals across stages from initial outreach to proposal, negotiation, and closed contract.
            </p>
          </div>

          {canCreate ? (
            <Button size="sm" variant="orange" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              New Deal Lead
            </Button>
          ) : null}
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid gap-4 xl:grid-cols-6 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const cfg = stageConfig[stage] || stageConfig.lead;
          const items = data?.[stage] || [];
          const totalVal = items.reduce((acc: number, item: { value: number }) => acc + (item.value || 0), 0);

          return (
            <div
              key={stage}
              className={`rounded-2xl border border-[var(--border)] border-t-3 ${cfg.border} bg-[var(--bg-elevated)] p-3 shadow-xs`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold capitalize text-[var(--fg)]">{cfg.label}</h3>
                  <div className="text-[10px] font-semibold text-[var(--fg-muted)]">
                    {formatCurrency(totalVal)}
                  </div>
                </div>
                <Badge tone={cfg.tone} className="text-[10px] !px-1.5 !py-0">
                  {items.length}
                </Badge>
              </div>

              <div className="space-y-2.5">
                {items.map((lead: {
                  _id: string;
                  name: string;
                  company?: string;
                  value: number;
                  source: string;
                }) => (
                  <Card
                    key={lead._id}
                    className="p-3 transition-all hover:border-[var(--purple-border)] hover:shadow-xs"
                  >
                    <div className="text-xs font-bold text-[var(--fg)]">{lead.name}</div>
                    <div className="truncate text-[11px] text-[var(--fg-muted)]">{lead.company}</div>
                    <div className="mt-2 text-sm font-black text-[var(--teal)]">
                      {formatCurrency(lead.value)}
                    </div>
                    <Badge tone="purple" className="mt-2 text-[9px] !px-1.5">
                      {lead.source}
                    </Badge>

                    {/* Quick Move and Convert actions */}
                    <div className="mt-3 flex flex-wrap gap-1 border-t border-[var(--divider)] pt-2">
                      {stages
                        .filter((s) => s !== stage)
                        .slice(0, 2)
                        .map((s) => (
                          <button
                            key={s}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] font-semibold capitalize text-[var(--fg-secondary)] transition hover:bg-[var(--purple-soft)] hover:text-[var(--purple-text)]"
                            onClick={() => move.mutate({ id: lead._id, stage: s })}
                          >
                            → {s}
                          </button>
                        ))}
                      {stage !== 'won' && stage !== 'lost' ? (
                        <button
                          type="button"
                          className="mt-1 w-full rounded-lg bg-[var(--teal-soft)] border border-[var(--teal-border)] py-1 text-[10px] font-bold text-[var(--teal-text)] transition hover:bg-[var(--teal)] hover:text-white"
                          onClick={() => convert.mutate(lead._id)}
                        >
                          Convert to Client
                        </button>
                      ) : null}
                    </div>
                  </Card>
                ))}
                {!items.length ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-[11px] text-[var(--fg-muted)]">
                    No deals here
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add New Opportunity Lead"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.name || create.isPending}
              onClick={() => create.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white"
            >
              {create.isPending ? 'Saving…' : 'Create Deal'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div>
            <Label required>Lead / Prospect Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Liam Turner"
            />
          </div>
          <div>
            <Label>Company Name</Label>
            <Input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="e.g. NextGen Apparel"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="liam@nextgen.com"
            />
          </div>
          <div>
            <Label>Deal Value (INR)</Label>
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="500000"
            />
          </div>
          <div>
            <Label>Acquisition Source</Label>
            <Select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option value="inbound">Inbound Website</option>
              <option value="referral">Client Referral</option>
              <option value="outreach">Cold Outreach / LinkedIn</option>
              <option value="event">Creator Summit / Event</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
