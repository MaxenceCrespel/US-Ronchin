import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth-store'
import { isProfileComplete, needsPositionsFix } from '@/lib/profile-completion'
import type { UserRole } from '@/lib/types'

export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (roles && user && user.role !== 'SUPERADMIN' && !roles.includes(user.role)) {
    return <Navigate to="/trainings" replace />
  }

  const complete = !user || isProfileComplete(user)
  if (!complete && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />
  }
  if (complete && location.pathname === '/complete-profile') {
    return <Navigate to="/" replace />
  }

  // Retroactive correction gate — an account with more positions than the current cap
  // allows gets stopped here until they re-pick, same shape as the complete-profile gate
  // above. needsPositionsFix stops firing the moment they fix it, so this never re-triggers.
  const needsFix = !!user && needsPositionsFix(user)
  if (needsFix && location.pathname !== '/fix-positions') {
    return <Navigate to="/fix-positions" replace />
  }
  if (!needsFix && location.pathname === '/fix-positions') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
