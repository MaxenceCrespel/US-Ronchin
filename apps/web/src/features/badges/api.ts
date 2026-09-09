import { apiClient } from '@/lib/api-client'
import type { AccountLevel, BadgeHolderGroup, BadgeStatus } from '@/lib/types'

export async function fetchMyBadges(): Promise<BadgeStatus[]> {
  const { data } = await apiClient.get<BadgeStatus[]>('/badges/me')
  return data
}

/** Admin-only — for every badge, who currently holds it. */
export async function fetchBadgeHolders(): Promise<BadgeHolderGroup[]> {
  const { data } = await apiClient.get<BadgeHolderGroup[]>('/badges/holders')
  return data
}

/** Admin-only override — grants a badge outright, bypassing eligibility (undoing a wrongly
 * deleted award, or a one-off exceptional grant). */
export async function grantBadge(badgeKey: string, userId: string): Promise<void> {
  await apiClient.post(`/badges/holders/${badgeKey}/grant`, { userId })
}

/** Admin-only override — removes a badge entirely. */
export async function revokeBadge(badgeKey: string, userId: string): Promise<void> {
  await apiClient.delete(`/badges/holders/${badgeKey}/${userId}`)
}

/** Admin-only override — removes a badge from every current holder at once. */
export async function revokeBadgeFromEveryone(badgeKey: string): Promise<{ removedCount: number }> {
  const { data } = await apiClient.delete<{ removedCount: number }>(`/badges/holders/${badgeKey}`)
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
