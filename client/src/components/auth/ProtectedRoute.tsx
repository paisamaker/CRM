import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export function ProtectedRoute({ resource, action = 'read' }: { resource?: string; action?: string }) {
  const { accessToken, user, can } = useAuthStore();
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (resource && !can(resource, action) && user.role !== 'ceo') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
