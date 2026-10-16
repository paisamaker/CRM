import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export function ProtectedRoute({ resource, action = 'read' }: { resource?: string; action?: string }) {
  const { accessToken, user, can, isRestoring } = useAuthStore();
  const location = useLocation();

  if (isRestoring) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-rose-600" />
          <span className="text-xs font-medium text-slate-500">Restoring session…</span>
        </div>
      </div>
    );
  }

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (resource && !can(resource, action) && user.role !== 'ceo') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
