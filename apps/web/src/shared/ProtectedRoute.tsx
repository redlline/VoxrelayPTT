import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  requireAdmin?: boolean;
  requireDispatcher?: boolean;
}

export function ProtectedRoute({ children, requireAdmin, requireDispatcher }: Props) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (requireDispatcher && user?.role !== 'admin' && user?.role !== 'dispatcher') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
