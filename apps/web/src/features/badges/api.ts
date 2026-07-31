import { apiClient } from '@/lib/api-client'
import type { AccountLevel, BadgeStatus } from '@/lib/types'

export async function fetchMyBadges(): Promise<BadgeStatus[]> {
  const { data } = await apiClient.get<BadgeStatus[]>('/badges/me')
  return data
}

export async function fetchBadgesForUser(userId: string): Promise<BadgeStatus[]> {
  const { data } = await apiClient.get<BadgeStatus[]>(`/badges/users/${userId}`)
  return data
}

export async function fetchAccountLevel(userId: string): Promise<AccountLevel> {
  const { data } = await apiClient.get<AccountLevel>(`/badges/users/${userId}/level`)
  return data
}

export async function fetchAllAccountLevels(): Promise<Record<string, AccountLevel>> {
  const { data } = await apiClient.get<Record<string, AccountLevel>>('/badges/levels')
  return data
}
