import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth-store'
import type { UserRole } from '@/lib/types'

export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/trainings" replace />
  }

  return <Outlet />
}
