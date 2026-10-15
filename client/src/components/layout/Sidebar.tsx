import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  Wallet,
  BarChart3,
  ShieldCheck,
  Bell,
  Settings,
  Building2,
  Target,
  ClipboardList,
  Landmark,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageSquare,
  FileText,
  X,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';

const sections = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'purple' },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['ceo', 'finance'], resource: 'analytics', accent: 'teal' },
      { to: '/alerts', label: 'Alerts', icon: Bell, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'orange' },
      { to: '/files', label: 'Files', icon: FolderOpen, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'files', accent: 'purple' },
      { to: '/chat', label: 'Chat', icon: MessageSquare, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'chat', accent: 'teal' },
    ],
  },
  {
    label: 'Work & Ops',
    items: [
      { to: '/tasks', label: 'Tasks & Workflow', icon: CheckSquare, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'teal' },
      { to: '/projects', label: 'Projects', icon: Briefcase, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'purple' },
      { to: '/attendance', label: 'Attendance', icon: Clock3, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'attendance', accent: 'orange' },
      { to: '/tasks/monitoring', label: 'Task Monitor', icon: ClipboardList, roles: ['ceo'], resource: 'tasks_monitoring', accent: 'teal' },
    ],
  },
  {
    label: 'Client Pipeline',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'teal' },
      { to: '/leads', label: 'Leads & Deals', icon: Target, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'orange' },
    ],
  },
  {
    label: 'Finance & P&L',
    items: [
      { to: '/finance', label: 'Finance Overview', icon: Landmark, roles: ['ceo', 'manager', 'finance'], resource: 'finance_overview', accent: 'teal' },
      { to: '/finance/transactions', label: 'Transactions', icon: Wallet, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'transactions', accent: 'orange' },
      { to: '/finance/invoices', label: 'Bills & Invoices', icon: FileText, roles: ['ceo', 'manager', 'finance'], resource: 'invoices', accent: 'purple' },
      { to: '/finance/payroll', label: 'Salary & Payroll', icon: Users, roles: ['ceo', 'finance'], resource: 'payroll', accent: 'teal' },
      { to: '/approvals', label: 'Approvals Queue', icon: ShieldCheck, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'orange' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Team & Roles', icon: Users, roles: ['ceo'], resource: 'users', accent: 'purple' },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'teal' },
      { to: '/audit', label: 'Audit Log', icon: ClipboardList, roles: ['ceo'], resource: 'audit', accent: 'orange' },
      { to: '/security', label: 'Security & MFA', icon: ShieldCheck, roles: ['ceo', 'manager', 'finance', 'employee'], accent: 'purple' },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = useAuthStore((s) => s.can);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  return (
    <>
      <div className={cn('flex h-16 items-center gap-3 border-b border-[var(--divider)] px-4 bg-[var(--bg-elevated)]', collapsed && 'justify-center px-2')}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-white p-0.5 shadow-sm">
          <img
            src="/images/starmedia_logo.webp"
            alt="Star Media Logo"
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold tracking-tight text-[var(--fg)]">STAR MEDIA</span>
              <span className="inline-flex items-center rounded-full bg-[var(--orange-soft)] px-1.5 py-0.2 text-[9px] font-bold text-[var(--orange-text)] border border-[var(--orange-border)]">
                PRO
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--fg-muted)]">
              <span>Project &amp; Operations CRM</span>
            </div>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section) => {
          const items = section.items.filter((item) => {
            if (!user) return false;
            if (!item.roles.includes(user.role)) return false;
            if (item.resource && !can(item.resource, 'read') && user.role !== 'ceo') return false;
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={section.label}>
              {!collapsed ? (
                <div className="mb-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--fg-muted)]">
                  {section.label}
                </div>
              ) : null}
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition-all duration-150',
                        'hover:bg-slate-100 hover:text-slate-900',
                        isActive
                          ? 'bg-teal-50/90 text-teal-900 font-semibold border-l-[3px] border-teal-600 shadow-xs'
                          : 'border-l-[3px] border-transparent',
                        collapsed && 'justify-center px-0 border-l-0'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Cloud Status badge in expanded sidebar */}
      {!collapsed ? (
        <div className="m-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs">
          <div className="flex items-center gap-2 font-medium text-slate-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600"></span>
            </span>
            <span className="font-semibold text-slate-900 text-[11px] tracking-tight">Ledger &amp; CRM Active</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">All services connected &amp; synced.</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="m-3 hidden items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--fg-secondary)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] md:flex"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        {!collapsed ? 'Collapse' : null}
      </button>
    </>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] transition-all duration-200 md:flex shadow-xs',
          collapsed ? 'w-[72px]' : 'w-[245px]'
        )}
      >
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgba(15,23,42,0.45)] backdrop-blur-xs" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[265px] flex-col bg-[var(--bg-sidebar)] shadow-[var(--shadow-modal)]">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-[var(--fg-secondary)] hover:bg-[var(--bg)]"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
