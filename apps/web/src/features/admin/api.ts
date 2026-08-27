import { apiClient } from '@/lib/api-client'
import type { UserRole } from '@/lib/types'

export interface UserActivityKpi {
  userId: string
  firstName: string
  lastName: string
  role: UserRole
  lastSeenAt: string | null
  activeDaysLast7: number
  activeDaysLast30: number
  last7Days: boolean[]
  pwaInstalled: boolean
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
