import { useEffect, useRef, useState } from 'react';
import { Menu, Search, LogOut, Sun, Moon, ChevronDown, Settings } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore network errors — still clear local session */
    }
    clearSession();
    setMenuOpen(false);
    navigate('/login');
  }

  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-header)] px-3 md:h-16 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-[var(--fg-secondary)]"
          aria-label="Open menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--fg-muted)]">
          <span className="hidden truncate sm:inline">{breadcrumb || 'Workspace'}</span>
          <span className="hidden text-[var(--border)] sm:inline">/</span>
          <span className="truncate font-semibold text-[var(--fg)]">{title || 'Workspace'}</span>
        </div>
      </div>

      <div className="relative mx-4 hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-muted)]" />
        <input
          type="text"
          onClick={() => setCommandOpen(true)}
          readOnly
          placeholder="Search…"
          className="h-9 w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] pl-9 pr-3 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] transition hover:border-[var(--fg-muted)]/40 hover:bg-[var(--bg-elevated)] focus:border-[var(--brand)] focus:bg-[var(--bg-elevated)] focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <NotificationBell />

        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fg-secondary)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 pl-1 pr-2 transition hover:bg-[var(--bg-subtle)] sm:pr-2.5"
          >
            <UserAvatar
              name={user?.name || 'User'}
              avatar={user?.avatar}
              className="h-7 w-7 rounded-full text-[10px]"
            />
            <div className="hidden min-w-0 text-left sm:block">
              <div className="truncate text-xs font-semibold leading-tight text-[var(--fg)]">
                {user?.name || 'Account'}
              </div>
              <div className="text-[10px] font-medium leading-tight capitalize text-[var(--fg-muted)]">
                {user?.role || 'Member'}
              </div>
            </div>
            <ChevronDown
              className={`hidden h-3.5 w-3.5 text-[var(--fg-muted)] transition sm:block ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-lg"
            >
              <div className="border-b border-[var(--border)] px-3.5 py-2.5">
                <div className="truncate text-sm font-semibold text-[var(--fg)]">{user?.name}</div>
                <div className="truncate text-[11px] text-[var(--fg-muted)]">{user?.email}</div>
              </div>
              <Link
                role="menuitem"
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
              >
                <Settings className="h-4 w-4 text-[var(--fg-muted)]" />
                Settings & profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                disabled={loggingOut}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? 'Signing out…' : 'Log out'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
