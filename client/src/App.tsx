import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/stores/auth';
import { isTokenExpired, refreshSession } from '@/lib/api';

// Eagerly loaded for instant login performance
import { LoginPage } from '@/features/auth/LoginPage';

// Route-level code splitting for all other screens (drastically reduces initial JS bundle)
const MfaPage = lazy(() => import('@/features/auth/MfaPage').then((m) => ({ default: m.MfaPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const AcceptInvitePage = lazy(() => import('@/features/auth/AcceptInvitePage').then((m) => ({ default: m.AcceptInvitePage })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const TaskMonitoringPage = lazy(() => import('@/features/tasks/TaskMonitoringPage').then((m) => ({ default: m.TaskMonitoringPage })));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ClientsPage = lazy(() => import('@/features/crm/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const LeadsPage = lazy(() => import('@/features/crm/LeadsPage').then((m) => ({ default: m.LeadsPage })));
const FinanceOverviewPage = lazy(() => import('@/features/finance/FinanceOverviewPage').then((m) => ({ default: m.FinanceOverviewPage })));
const TransactionsPage = lazy(() => import('@/features/finance/TransactionsPage').then((m) => ({ default: m.TransactionsPage })));
const InvoicesPage = lazy(() => import('@/features/finance/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const PayrollPage = lazy(() => import('@/features/finance/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const ApprovalsPage = lazy(() => import('@/features/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const AlertsPage = lazy(() => import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const UsersPage = lazy(() => import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AuditPage = lazy(() => import('@/features/settings/AuditPage').then((m) => ({ default: m.AuditPage })));
const SecurityPage = lazy(() => import('@/features/settings/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const FilesPage = lazy(() => import('@/features/files/FilesPage').then((m) => ({ default: m.FilesPage })));
const AttendancePage = lazy(() => import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000, // 1 minute fresh cache
      gcTime: 1000 * 60 * 30, // Retain query cache for 30 minutes in memory
    },
  },
});

function PageLoader() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-2.5">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
        <span className="text-xs font-medium text-slate-500">Loading module…</span>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    let mounted = true;
    async function initSession() {
      const { accessToken } = useAuthStore.getState();
      // If no token exists in memory/storage OR if it is expired, restore from 7-day cookie
      if (!accessToken || isTokenExpired(accessToken)) {
        await refreshSession();
      }
      if (mounted) {
        useAuthStore.setState({ isRestoring: false });
      }
    }
    initSession();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/mfa" element={<MfaPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/finance/transactions" element={<TransactionsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/security" element={<SecurityPage />} />

                <Route element={<ProtectedRoute resource="tasks_monitoring" />}>
                  <Route path="/tasks/monitoring" element={<TaskMonitoringPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="finance_overview" />}>
                  <Route path="/finance" element={<FinanceOverviewPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="invoices" />}>
                  <Route path="/finance/invoices" element={<InvoicesPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="payroll" />}>
                  <Route path="/finance/payroll" element={<PayrollPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="analytics" />}>
                  <Route path="/analytics" element={<AnalyticsPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="users" />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="settings" />}>
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route element={<ProtectedRoute resource="audit" />}>
                  <Route path="/audit" element={<AuditPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster richColors position="top-right" theme="light" closeButton />
    </QueryClientProvider>
  );
}
