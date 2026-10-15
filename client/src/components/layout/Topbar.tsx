import { Command, Menu, Search, LogOut, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from './NotificationBell';
import { UserAvatar } from '@/components/ui/UserAvatar';

export function Topbar({ title, breadcrumb }: { title?: string; breadcrumb?: string }) {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { setCommandOpen, setMobileNavOpen } = useUIStore();
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
    navigate('/login');
  }

  const roleTone =
    user?.role === 'ceo'
      ? 'purple'
      : user?.role === 'finance'
        ? 'teal'
        : user?.role === 'manager'
          ? 'orange'
          : 'default';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-header)] backdrop-blur-md px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span className="font-semibold text-teal-700">
              {breadcrumb || 'Workspace'}
            </span>
            <span className="text-slate-300">/</span>
            <span className="truncate text-slate-600">{title || 'STAR MEDIA CRM'}</span>
          </div>
          <div className="truncate text-base font-bold text-slate-900 tracking-tight">
            {title || 'STAR MEDIA CRM'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-600 shadow-xs transition hover:border-slate-300 hover:bg-white hover:text-slate-900 lg:flex"
        >
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <span>Quick search</span>
          <span className="ml-3 inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            <Command className="h-2.5 w-2.5" />K
          </span>
        </button>

        <NotificationBell />

        <div className="ml-1 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-xs">
          <Link
            to="/settings"
            title="Profile & Account Settings"
            className="flex items-center gap-2 rounded-lg p-0.5 pr-2 transition hover:bg-slate-100/80 group"
          >
            <UserAvatar
              name={user?.name}
              avatar={user?.avatar}
              className="h-8 w-8 rounded-lg text-xs transition-transform group-hover:scale-105"
              indicator
            />
            <div className="hidden min-w-0 sm:block text-left">
              <div className="truncate text-xs font-bold text-[var(--fg)] group-hover:text-teal-700 transition-colors">
                {user?.name}
              </div>
              <div className="flex items-center gap-1">
                <Badge tone={roleTone} className="!px-1.5 !py-0 text-[9px] uppercase tracking-wider font-bold">
                  {user?.role}
                </Badge>
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-1.5 text-[var(--fg-secondary)] transition hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
