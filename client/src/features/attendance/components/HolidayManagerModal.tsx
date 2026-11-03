import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Plus, Trash2, Sparkles } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { formatDateReadable } from '../attendanceUtils';
import type { CompanyHoliday } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
};

type HolidayGroup = {
  name: string;
  recurring: boolean;
  start: string;
  end: string;
  dates: string[];
  count: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 60;

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Expand inclusive date range into YYYY-MM-DD keys */
function expandDateRange(start: string, end: string): string[] {
  const from = parseKey(start);
  const to = parseKey(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];
  const out: string[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    out.push(toKey(cur));
    cur.setDate(cur.getDate() + 1);
    if (out.length > MAX_RANGE_DAYS) break;
  }
  return out;
}

function dayDiff(start: string, end: string) {
  const ms = parseKey(end).getTime() - parseKey(start).getTime();
  return Math.floor(ms / 86400000) + 1;
}

/** Group consecutive same-name holidays for a cleaner list */
function groupHolidays(list: CompanyHoliday[]): HolidayGroup[] {
  const sorted = [...list].sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });

  const groups: HolidayGroup[] = [];
  for (const h of sorted) {
    const recurring = !!h.recurring;
    const last = groups[groups.length - 1];
    if (
      last &&
      last.name === h.name &&
      last.recurring === recurring &&
      dayDiff(last.end, h.date) === 2
    ) {
      last.end = h.date;
      last.dates.push(h.date);
      last.count += 1;
    } else {
      groups.push({
        name: h.name,
        recurring,
        start: h.date,
        end: h.date,
        dates: [h.date],
        count: 1,
      });
    }
  }
  return groups;
}

export function HolidayManagerModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recurring, setRecurring] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings-holidays'],
    queryFn: async () => (await api.get('/settings')).data.data.settings,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !data) return;
    setHolidays(
      [...(data.companyHolidays || [])].sort((a: CompanyHoliday, b: CompanyHoliday) =>
        String(a.date).localeCompare(String(b.date))
      )
    );
  }, [open, data]);

  const groups = useMemo(() => groupHolidays(holidays), [holidays]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return groups.filter((g) => g.recurring || g.end >= today).slice(0, 6);
  }, [groups]);

  const rangePreview = useMemo(() => {
    if (!DATE_RE.test(startDate)) return 0;
    const end = DATE_RE.test(endDate) ? endDate : startDate;
    if (parseKey(end) < parseKey(startDate)) return 0;
    return Math.min(MAX_RANGE_DAYS, dayDiff(startDate, end));
  }, [startDate, endDate]);

  const save = useMutation({
    mutationFn: async (next: CompanyHoliday[]) =>
      api.patch('/settings', { companyHolidays: next }),
    onSuccess: async (_res, next) => {
      toast.success(
        next.length === holidays.length
          ? 'Company holidays updated'
          : `Saved ${next.length} holiday day${next.length === 1 ? '' : 's'}`
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['settings-holidays'] }),
        qc.invalidateQueries({ queryKey: ['attendance-heatmap'] }),
        qc.invalidateQueries({ queryKey: ['attendance-employee-heatmap'] }),
        qc.invalidateQueries({ queryKey: ['attendance-employee-directory'] }),
      ]);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  function addHoliday() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a holiday name');
      return;
    }
    if (!DATE_RE.test(startDate)) {
      toast.error('Enter a valid start date');
      return;
    }
    const end = DATE_RE.test(endDate) ? endDate : startDate;
    if (parseKey(end) < parseKey(startDate)) {
      toast.error('End date must be on or after the start date');
      return;
    }
    if (dayDiff(startDate, end) > MAX_RANGE_DAYS) {
      toast.error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
      return;
    }

    const dates = expandDateRange(startDate, end);
    if (!dates.length) {
      toast.error('Could not build that date range');
      return;
    }

    const existing = new Set(
      holidays.map((h) => `${h.date}|${h.recurring ? '1' : '0'}`)
    );
    const toAdd: CompanyHoliday[] = [];
    for (const d of dates) {
      const key = `${d}|${recurring ? '1' : '0'}`;
      if (existing.has(key)) continue;
      toAdd.push({ date: d, name: trimmed, recurring });
      existing.add(key);
    }

    if (!toAdd.length) {
      toast.error('Those dates are already listed as holidays');
      return;
    }

    const next = [...holidays, ...toAdd].sort((a, b) => a.date.localeCompare(b.date));
    setHolidays(next);
    setName('');
    setStartDate('');
    setEndDate('');
    setRecurring(false);
    save.mutate(next);
    if (toAdd.length > 1) {
      toast.message(`Added ${toAdd.length} continuous holiday days`);
    }
  }

  function removeGroup(group: HolidayGroup) {
    const removeSet = new Set(group.dates.map((d) => `${d}|${group.name}|${group.recurring ? '1' : '0'}`));
    const next = holidays.filter(
      (h) => !removeSet.has(`${h.date}|${h.name}|${h.recurring ? '1' : '0'}`)
    );
    setHolidays(next);
    save.mutate(next);
  }

  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title="Company holidays"
      description="Sundays are always off. Add a single day or a continuous date range for multi-day breaks."
      size="md"
      preventDismiss={save.isPending}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            {holidays.length} day{holidays.length === 1 ? '' : 's'} · {groups.length} holiday
            {groups.length === 1 ? '' : 's'}
          </p>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-teal-200/70 bg-teal-50/50 p-3.5">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
            <div className="text-xs text-teal-900/90 leading-relaxed">
              <strong className="font-semibold">Work week:</strong> Monday–Saturday count as working days.
              Sundays never count. Use a date range to add continuous holidays (e.g. Diwali week) in one step.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-amber-600" />
            Add holiday
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Holiday name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali break, Year-end shutdown"
              />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (!endDate || (endDate && v && endDate < v)) setEndDate(v);
                }}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Same as start for a single day. Leave end blank to use start only.
              </p>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="rounded text-teal-600"
                />
                Repeats every year
              </label>
              {rangePreview > 0 ? (
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  {rangePreview} day{rangePreview === 1 ? '' : 's'} will be added
                </span>
              ) : null}
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            disabled={save.isPending || isLoading}
            onClick={addHoliday}
          >
            <Plus className="h-3.5 w-3.5" />
            {rangePreview > 1 ? `Add ${rangePreview}-day range` : 'Add to calendar'}
          </Button>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Scheduled holidays
          </h4>
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-800">No company holidays yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Add a single day or a continuous range so calendars stay accurate.
              </p>
            </div>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {groups.map((g) => (
                <li
                  key={`${g.start}-${g.end}-${g.name}-${g.recurring ? 'r' : 'o'}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{g.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {g.count > 1 ? (
                        <>
                          {formatDateReadable(g.start)} → {formatDateReadable(g.end)}
                          <span className="ml-1 font-semibold text-amber-800">· {g.count} days</span>
                        </>
                      ) : (
                        formatDateReadable(g.start)
                      )}
                      {g.recurring ? ' · Annual' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                    title={g.count > 1 ? 'Remove entire range' : 'Remove holiday'}
                    disabled={save.isPending}
                    onClick={() => removeGroup(g)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Next up: {upcoming.map((g) => (g.count > 1 ? `${g.name} (${g.count}d)` : g.name)).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
