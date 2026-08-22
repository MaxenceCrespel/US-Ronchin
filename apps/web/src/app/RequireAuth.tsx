import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth-store'
import { isProfileComplete } from '@/lib/profile-completion'
import type { UserRole } from '@/lib/types'

export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/trainings" replace />
  }

  const complete = !user || isProfileComplete(user)
  if (!complete && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />
  }
  if (complete && location.pathname === '/complete-profile') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
