import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  CreditCard,
  HandCoins,
  Video,
  Plane,
  X,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  resource?: string;
  badgeKey?: 'projects' | 'paymentRequests' | 'approvals' | 'chat' | 'meetings' | 'leaves';
}

type SidebarBadges = {
  projects: number;
  paymentRequests: number;
  approvals: number;
  chat: number;
  meetings: number;
  leaves: number;
};

function formatBadge(count: number): string | number | null {
  if (!count || count <= 0) return null;
  return count > 99 ? '99+' : count;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: '',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['ceo', 'finance'], resource: 'analytics' },
      { to: '/alerts', label: 'Alerts', icon: Bell, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/files', label: 'Files', icon: FolderOpen, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'files' },
      { to: '/chat', label: 'Chat', icon: MessageSquare, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'chat', badgeKey: 'chat' },
      {
        to: '/meetings',
        label: 'Meetings',
        icon: Video,
        roles: ['ceo', 'manager', 'finance', 'employee'],
        resource: 'meetings',
        badgeKey: 'meetings',
      },
      { to: '/tasks', label: 'Tasks & Workflow', icon: CheckSquare, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/projects', label: 'Projects', icon: Briefcase, roles: ['ceo', 'manager', 'finance', 'employee'], badgeKey: 'projects' },
      { to: '/attendance', label: 'Attendance', icon: Clock3, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'attendance' },
      {
        to: '/leaves',
        label: 'Leave Applications',
        icon: Plane,
        roles: ['ceo', 'manager', 'finance', 'employee'],
        resource: 'leaves',
        badgeKey: 'leaves',
      },
      { to: '/tasks/monitoring', label: 'Task Monitor', icon: ClipboardList, roles: ['ceo'], resource: 'tasks_monitoring' },
    ],
  },
  {
    label: 'CLIENT PIPELINE',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/leads', label: 'Leads & Deals', icon: Target, roles: ['ceo', 'manager', 'finance', 'employee'] },
    ],
  },
  {
    label: 'FINANCE & P&L',
    items: [
      { to: '/finance', label: 'Finance Overview', icon: Landmark, roles: ['ceo', 'manager', 'finance'], resource: 'finance_overview' },
      { to: '/finance/transactions', label: 'Transactions', icon: Wallet, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'transactions' },
      { to: '/finance/payment-requests', label: 'Payment Requests', icon: CreditCard, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'transactions', badgeKey: 'paymentRequests' },
      { to: '/finance/credit', label: 'Credit & Loans', icon: HandCoins, roles: ['ceo', 'manager'] },
      { to: '/finance/invoices', label: 'Bills & Invoices', icon: FileText, roles: ['ceo', 'manager', 'finance'], resource: 'invoices' },
      { to: '/finance/payroll', label: 'Salary & Payroll', icon: Users, roles: ['ceo', 'finance'], resource: 'payroll' },
      { to: '/approvals', label: 'Approvals Queue', icon: ShieldCheck, roles: ['ceo', 'manager', 'finance', 'employee'], badgeKey: 'approvals' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { to: '/users', label: 'Team & Roles', icon: Users, roles: ['ceo'], resource: 'users' },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/audit', label: 'Audit Log', icon: ClipboardList, roles: ['ceo'], resource: 'audit' },
      { to: '/security', label: 'Security & MFA', icon: ShieldCheck, roles: ['ceo', 'manager', 'finance', 'employee'] },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = useAuthStore((s) => s.can);
  const clearSession = useAuthStore((s) => s.clearSession);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const navigate = useNavigate();

  const qc = useQueryClient();

  const { data: badges } = useQuery({
    queryKey: ['sidebar-badges'],
    queryFn: async () =>
      (await api.get('/alerts/sidebar-badges')).data.data as SidebarBadges,
    enabled: !!user,
    refetchInterval: 20_000,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const badgeMap: SidebarBadges = {
    projects: badges?.projects || 0,
    paymentRequests: badges?.paymentRequests || 0,
    approvals: badges?.approvals || 0,
    chat: badges?.chat || 0,
    meetings: badges?.meetings || 0,
    leaves: badges?.leaves || 0,
  };

  async function ackSidebarScope(scope?: NavItem['badgeKey']) {
    if (!scope) return;
    try {
      await api.post('/alerts/sidebar-badges/ack', { scopes: [scope] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sidebar-badges'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    } catch {
      /* non-fatal — live badges still refresh on interval */
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
    onNavigate?.();
    navigate('/login');
  }

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[var(--bg-sidebar)] text-[var(--sidebar-fg)]">
      {/* Brand */}
      <div className="relative z-10 border-b border-[var(--sidebar-border)] px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-white">
              <img
                src="/images/starmedia_logo.webp"
                alt="Star Media"
                className="h-full w-full object-contain p-0.5"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-tight text-[var(--fg)]">
                Star Media
              </div>
              <div className="truncate text-[11px] text-[var(--fg-muted)]">CRM</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-white">
              <img
                src="/images/starmedia_logo.webp"
                alt="Star Media"
                className="h-full w-full object-contain p-0.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="relative z-10 flex-1 space-y-3.5 overflow-y-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section, idx) => {
          const items = section.items.filter((item) => {
            if (!user) return false;
            if (!item.roles.includes(user.role)) return false;
            if (
              item.resource &&
              !can(item.resource, 'read') &&
              user.role !== 'ceo' &&
              !(item.resource === 'meetings' && ['manager', 'finance', 'employee'].includes(user.role))
            ) {
              return false;
            }
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={section.label || idx}>
              {!collapsed && section.label ? (
                <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--fg-muted)]">
                  {section.label}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const badgeValue = item.badgeKey
                    ? formatBadge(badgeMap[item.badgeKey])
                    : null;
                  const hasAlert = !!badgeValue;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={
                        collapsed
                          ? hasAlert
                            ? `${item.label} (${badgeValue} new)`
                            : item.label
                          : undefined
                      }
                      onClick={() => {
                        void ackSidebarScope(item.badgeKey);
                        onNavigate?.();
                      }}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                          isActive
                            ? 'bg-[var(--sidebar-active)] font-semibold text-white'
                            : 'text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--sidebar-fg-hover)]',
                          collapsed && 'justify-center px-0',
                          hasAlert && !isActive && 'bg-rose-50'
                        )
                      }
                    >
                      <span className="relative shrink-0">
                        <item.icon className="h-4 w-4" />
                        {hasAlert ? (
                          <span
                            className={cn(
                              'absolute -right-1 -top-1 rounded-full bg-rose-500 ring-2 ring-[var(--bg-sidebar)]',
                              collapsed ? 'h-2.5 w-2.5' : 'h-2 w-2'
                            )}
                          />
                        ) : null}
                      </span>
                      {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                      {!collapsed && hasAlert ? (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                          {badgeValue}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="relative z-10 space-y-2 border-t border-[var(--sidebar-border)] p-3">
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar
              name={user?.name || 'User'}
              avatar={user?.avatar}
              className="h-8 w-8 shrink-0 rounded-full text-xs"
            />
            {!collapsed && (
              <div className="min-w-0 text-left">
                <div className="truncate text-xs font-semibold text-[var(--fg)]">
                  {user?.name || 'User'}
                </div>
                <div className="text-[11px] capitalize text-[var(--fg-muted)]">
                  {user?.role || 'Member'}
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md p-1.5 text-[var(--fg-muted)] transition hover:bg-rose-50 hover:text-rose-600"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-md p-1.5 text-[var(--fg-muted)] transition hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--fg)]"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
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
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--sidebar-border)] bg-[var(--bg-sidebar)] transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-[235px]'
        )}
      >
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[255px] flex-col bg-[var(--bg-sidebar)] shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
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
