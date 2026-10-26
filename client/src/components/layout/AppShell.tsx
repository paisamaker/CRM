import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { useUIStore } from '@/stores/ui';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/analytics': 'Analytics',
  '/alerts': 'Alerts & Notifications',
  '/files': 'Files',
  '/tasks': 'Tasks & Workflow',
  '/tasks/monitoring': 'Task Monitoring',
  '/projects': 'Projects',
  '/attendance': 'Attendance',
  '/chat': 'Chat',
  '/clients': 'Clients',
  '/leads': 'Leads',
  '/finance': 'Finance Overview',
  '/finance/transactions': 'Transactions',
  '/finance/invoices': 'Bills',
  '/finance/payroll': 'Salary & Payroll',
  '/approvals': 'Approvals',
  '/users': 'Users',
  '/settings': 'Settings',
  '/audit': 'Audit Log',
  '/security': 'Security',
};

export function AppShell() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setTheme = useUIStore((s) => s.setTheme);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const location = useLocation();

  useEffect(() => {
    setTheme('light');
  }, [setTheme]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .get('/auth/me')
      .then((res) => {
        if (res.data?.data?.permissions) setPermissions(res.data.data.permissions);
      })
      .catch(() => undefined);
  }, [accessToken, setPermissions]);

  useEffect(() => {
    if (accessToken) connectSocket();
    return () => disconnectSocket();
  }, [accessToken]);

  const title =
    titles[location.pathname] ||
    Object.entries(titles).find(([k]) => location.pathname.startsWith(k) && k !== '/')?.[1] ||
    'STAR MEDIA CRM';

  const isChatRoute = location.pathname.startsWith('/chat');

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar />
      <div className={cn('transition-[padding] duration-200', collapsed ? 'md:pl-[72px]' : 'md:pl-[235px]')}>
        <Topbar title={title} breadcrumb="Workspace" />
        <main
          className={cn(
            isChatRoute
              ? 'h-[calc(100vh-4rem)] w-full overflow-hidden p-0'
              : 'mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8'
          )}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
