import { NavLink, useNavigate } from 'react-router-dom';
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
  badge?: number | string;
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
      { to: '/chat', label: 'Chat', icon: MessageSquare, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'chat' },
      { to: '/tasks', label: 'Tasks & Workflow', icon: CheckSquare, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/projects', label: 'Projects', icon: Briefcase, roles: ['ceo', 'manager', 'finance', 'employee'] },
      { to: '/attendance', label: 'Attendance', icon: Clock3, roles: ['ceo', 'manager', 'finance', 'employee'], resource: 'attendance' },
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
      { to: '/finance/invoices', label: 'Bills & Invoices', icon: FileText, roles: ['ceo', 'manager', 'finance'], resource: 'invoices' },
      { to: '/finance/payroll', label: 'Salary & Payroll', icon: Users, roles: ['ceo', 'finance'], resource: 'payroll' },
      { to: '/approvals', label: 'Approvals Queue', icon: ShieldCheck, roles: ['ceo', 'manager', 'finance', 'employee'] },
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
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-gradient-to-b from-white via-[#F6F9FA] to-[#EDF5F5] text-slate-700">
      {/* Tinted Cloud Ambient Glow & Mist Shading */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Upper Cloud Puff - Subtle Teal Mist */}
        <div className="absolute -top-10 -left-10 h-44 w-44 rounded-full bg-[#00a884]/[0.08] blur-2xl" />
        {/* Upper Right Cloud Glow */}
        <div className="absolute top-12 -right-8 h-36 w-36 rounded-full bg-sky-200/25 blur-2xl" />
        {/* Center Floating Cloud Shade */}
        <div className="absolute top-1/2 -left-12 h-52 w-52 rounded-full bg-emerald-100/35 blur-3xl" />
        {/* Lower Ambient Cloud Shade */}
        <div className="absolute -bottom-10 -right-8 h-48 w-48 rounded-full bg-teal-200/20 blur-3xl" />
        {/* Soft Cloud Sky Gradient Tint */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(240,253,250,0.7),_transparent_70%)]" />
      </div>

      {/* Top Brand Card */}
      <div className="relative z-10 p-3 border-b border-slate-200/60 bg-white/50 backdrop-blur-xs">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/80 p-2 border border-slate-200/80 shadow-2xs backdrop-blur-xs">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-2xs">
              <img
                src="/images/starmedia_logo.webp"
                alt="Star Media Logo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-black tracking-tight text-slate-900">STAR MEDIA</span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.2 text-[8.5px] font-bold text-amber-800 border border-amber-300">
                  PRO
                </span>
              </div>
              <div className="truncate text-[10px] font-medium text-slate-500">
                Project &amp; Operations CRM
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/90 p-1 border border-slate-200 shadow-2xs">
              <img
                src="/images/starmedia_logo.webp"
                alt="Star Media Logo"
                className="h-full w-full object-contain"
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
            if (item.resource && !can(item.resource, 'read') && user.role !== 'ceo') return false;
            return true;
          });
          if (!items.length) return null;
          return (
            <div key={section.label || idx}>
              {!collapsed && section.label ? (
                <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  {section.label}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-[#00a884] text-white font-semibold shadow-xs shadow-teal-700/20'
                          : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:shadow-2xs',
                        collapsed && 'justify-center px-0'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                    {!collapsed ? <span className="truncate flex-1">{item.label}</span> : null}
                    {!collapsed && item.badge ? (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                        {item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Area: Online Status & User Profile */}
      <div className="relative z-10 p-3 space-y-2 border-t border-slate-200/60 bg-white/60 backdrop-blur-xs">
        {!collapsed ? (
          <div className="rounded-xl bg-white/85 border border-slate-200/80 px-3 py-2 shadow-2xs backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold text-emerald-600 tracking-tight">Online</span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-slate-500">All services connected</p>
          </div>
        ) : (
          <div className="flex justify-center py-1" title="Online: All services connected">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-1 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserAvatar
              name={user?.name || 'User'}
              avatar={user?.avatar}
              className="h-8 w-8 rounded-full ring-1 ring-slate-200 shrink-0 text-xs shadow-2xs"
            />
            {!collapsed && (
              <div className="min-w-0 text-left">
                <div className="truncate text-xs font-bold text-slate-900">{user?.name || 'User'}</div>
                <div className="text-[10px] font-medium capitalize text-slate-500">{user?.role || 'Member'}</div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void logout()}
              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition"
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
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-gradient-to-b from-white via-[#F6F9FA] to-[#EDF5F5] transition-all duration-200 md:flex shadow-[2px_0_16px_-4px_rgba(0,168,132,0.06),1px_0_0_0_rgba(226,232,240,0.85)]',
          collapsed ? 'w-[72px]' : 'w-[235px]'
        )}
      >
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[255px] flex-col bg-gradient-to-b from-white via-[#F6F9FA] to-[#EDF5F5] shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
