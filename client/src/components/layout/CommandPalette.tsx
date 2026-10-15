import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { Input } from '@/components/ui/Input';

const links = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Tasks', to: '/tasks' },
  { label: 'Task Monitoring', to: '/tasks/monitoring', resource: 'tasks_monitoring' },
  { label: 'Projects', to: '/projects' },
  { label: 'Clients', to: '/clients' },
  { label: 'Leads', to: '/leads' },
  { label: 'Finance Overview', to: '/finance', resource: 'finance_overview' },
  { label: 'Transactions', to: '/finance/transactions' },
  { label: 'Bills', to: '/finance/invoices', resource: 'invoices' },
  { label: 'Salary & Payroll', to: '/finance/payroll', resource: 'payroll' },
  { label: 'Approvals', to: '/approvals' },
  { label: 'Analytics', to: '/analytics', resource: 'analytics' },
  { label: 'Alerts', to: '/alerts' },
  { label: 'Files', to: '/files', resource: 'files' },
  { label: 'Attendance', to: '/attendance', resource: 'attendance' },
  { label: 'Chat', to: '/chat', resource: 'chat' },
  { label: 'Users', to: '/users', resource: 'users' },
  { label: 'Settings', to: '/settings', resource: 'settings' },
  { label: 'Audit Log', to: '/audit', resource: 'audit' },
  { label: 'Security', to: '/security' },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const can = useAuthStore((s) => s.can);
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  const allowed = useMemo(
    () =>
      links.filter((l) => {
        if (!user) return false;
        if (l.resource && !can(l.resource, 'read') && user.role !== 'ceo') return false;
        return true;
      }),
    [can, user]
  );

  const results = useMemo(
    () => allowed.filter((l) => l.label.toLowerCase().includes(q.toLowerCase())),
    [q, allowed]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(23,32,51,0.36)] p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-[var(--divider)] p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Jump to a page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {results.map((r) => (
            <button
              key={r.to}
              type="button"
              className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm font-medium text-[var(--fg)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
              onClick={() => {
                navigate(r.to);
                setOpen(false);
                setQ('');
              }}
            >
              {r.label}
            </button>
          ))}
          {!results.length ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--fg-muted)]">No matches</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
