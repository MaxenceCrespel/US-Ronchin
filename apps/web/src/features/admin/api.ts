import { apiClient } from '@/lib/api-client'
import type { UserRole, UserStatus } from '@/lib/types'

export interface UserActivityKpi {
  userId: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
  lastSeenAt: string | null
  loginCount: number
  activeDaysLast7: number
  activeDaysLast30: number
  activeDaysAllTime: number
  last7Days: boolean[]
  pwaInstalled: boolean
  pwaInstalledAt: string | null
  notificationsEnabled: boolean
}

export interface AdminKpisResponse {
  totalUsers: number
  activeLast7Days: number
  activeLast30Days: number
  players: UserActivityKpi[]
}

export async function fetchAdminKpis(): Promise<AdminKpisResponse> {
  const { data } = await apiClient.get<AdminKpisResponse>('/admin/kpis')
  return data
}
