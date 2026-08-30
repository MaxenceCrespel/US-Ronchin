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

export interface SeparationRule {
  id: string
  otherUserId: string
  otherUserFirstName: string
  otherUserLastName: string
  createdAt: string
}

/** "Never on the same training team" pairs — declared by an admin on a player's fiche,
 * applied automatically when teams are generated (TeamBalancingService.generateTeams). */
export async function fetchSeparationRulesForUser(userId: string): Promise<SeparationRule[]> {
  const { data } = await apiClient.get<SeparationRule[]>(`/player-separation-rules/${userId}`)
  return data
}

export async function createSeparationRule(userAId: string, userBId: string): Promise<void> {
  await apiClient.post('/player-separation-rules', { userAId, userBId })
}

export async function deleteSeparationRule(id: string): Promise<void> {
  await apiClient.delete(`/player-separation-rules/${id}`)
}
