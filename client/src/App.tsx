import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaPage } from '@/features/auth/MfaPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { TaskMonitoringPage } from '@/features/tasks/TaskMonitoringPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ClientsPage } from '@/features/crm/ClientsPage';
import { LeadsPage } from '@/features/crm/LeadsPage';
import { FinanceOverviewPage } from '@/features/finance/FinanceOverviewPage';
import { TransactionsPage } from '@/features/finance/TransactionsPage';
import { InvoicesPage } from '@/features/finance/InvoicesPage';
import { PayrollPage } from '@/features/finance/PayrollPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AuditPage } from '@/features/settings/AuditPage';
import { SecurityPage } from '@/features/settings/SecurityPage';
import { FilesPage } from '@/features/files/FilesPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { ChatPage } from '@/features/chat/ChatPage';

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
      </BrowserRouter>
      <Toaster richColors position="top-right" theme="light" closeButton />
    </QueryClientProvider>
  );
}
