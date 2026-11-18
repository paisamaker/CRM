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
  '/leaves': 'Leave Applications',
  '/chat': 'Chat',
  '/meetings': 'Meetings',
  '/clients': 'Clients',
  '/leads': 'Leads',
  '/finance': 'Finance Overview',
  '/finance/transactions': 'Transactions',
  '/finance/payment-requests': 'Payment Requests',
  '/finance/credit': 'Credit & Loans',
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const location = useLocation();

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
    [...Object.entries(titles)]
      .filter(([k]) => k !== '/' && location.pathname.startsWith(k + '/'))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ||
    titles[Object.keys(titles).find((k) => location.pathname === k) || ''] ||
    'STAR MEDIA CRM';

  const isChatRoute = location.pathname.startsWith('/chat');
  const isMeetingRoom = location.pathname.startsWith('/meetings/room/');
  const chatThreadOpen = isChatRoute && new URLSearchParams(location.search).has('c');

  if (isMeetingRoom) {
    return (
      <div className="min-h-[100dvh] bg-[#202124]">
        <Outlet />
        <CommandPalette />
      </div>
    );
  }

  const contentPad = collapsed ? 'md:pl-[72px]' : 'md:pl-[235px]';

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)]">
      {/* WhatsApp-style: hide CRM chrome on mobile while a chat thread is open */}
      <div className={cn(chatThreadOpen && 'max-md:hidden')}>
        <Sidebar />
      </div>
      <div className={cn('transition-[padding] duration-200', contentPad)}>
        <div className={cn(chatThreadOpen && 'max-md:hidden')}>
          <Topbar title={title} breadcrumb="Workspace" />
        </div>
        <main
          className={cn(
            isChatRoute
              ? cn(
                  'w-full overflow-hidden p-0',
                  chatThreadOpen ? 'h-[100dvh] md:h-[calc(100dvh-4rem)]' : 'h-[calc(100dvh-4rem)]'
                )
              : 'mx-auto w-full max-w-[1440px] px-3 py-3 sm:px-4 sm:py-5 md:px-6 md:py-6 lg:px-8'
          )}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
