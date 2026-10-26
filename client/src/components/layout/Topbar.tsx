import { Command, Menu, Search, LogOut, Sparkles, Sun, ChevronDown } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { Button } from '@/components/ui/Button';
import { NotificationBell } from './NotificationBell';
import { UserAvatar } from '@/components/ui/UserAvatar';

export function Topbar({ title, breadcrumb }: { title?: string; breadcrumb?: string }) {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { setCommandOpen, setMobileNavOpen, theme, setTheme } = useUIStore();
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md md:px-6">
      {/* Left: Clean Breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-slate-600"
          aria-label="Open menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <span className="text-slate-500 hover:text-slate-700 transition cursor-pointer">
            {breadcrumb || 'Workspace'}
          </span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800">{title || 'Chat'}</span>
        </div>
      </div>

      {/* Center: Search Anything pill input */}
      <div className="relative mx-auto hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          onClick={() => setCommandOpen(true)}
          readOnly
          placeholder="Search anything..."
          className="h-9 w-full rounded-full border border-slate-200 bg-slate-50/70 pl-9 pr-4 text-xs text-slate-700 placeholder:text-slate-400 shadow-2xs transition hover:bg-white hover:border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
        />
      </div>

      {/* Right: Notification, Theme toggle, User pill */}
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        {/* Theme toggle (Sun) */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4" />
        </button>

        {/* User Pill: SB, Sahil Bhagat, Admin */}
        <div className="relative group">
          <Link
            to="/settings"
            title="Account Settings"
            className="flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white py-1 pl-1 pr-3 shadow-xs transition hover:bg-slate-50 hover:border-slate-300"
          >
            <UserAvatar
              name={user?.name || 'User'}
              avatar={user?.avatar}
              className="h-7 w-7 rounded-full text-[10px]"
            />
            <div className="hidden min-w-0 text-left sm:block">
              <div className="truncate text-xs font-bold leading-tight text-slate-800">
                {user?.name || 'Account'}
              </div>
              <div className="text-[10px] font-medium leading-tight capitalize text-slate-400">
                {user?.role || 'Member'}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>
    </header>
  );
}
