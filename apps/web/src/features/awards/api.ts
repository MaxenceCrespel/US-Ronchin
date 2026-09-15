import { apiClient } from '@/lib/api-client'
import type { AwardCategory, MonthlyAward } from '@/lib/types'

export async function fetchAwardCategories(): Promise<AwardCategory[]> {
  const { data } = await apiClient.get<AwardCategory[]>('/awards/categories')
  return data
}

export async function fetchMonthlyAward(): Promise<MonthlyAward> {
  const { data } = await apiClient.get<MonthlyAward>('/awards/monthly')
  return data
}

/** Every trophy source collapsed to one number server-side — see AwardsService.getMyTrophyCount
 * for why this replaces 5 separate detailed requests just to show a count. */
export async function fetchMyTrophyCount(): Promise<number> {
  const { data } = await apiClient.get<number>('/awards/trophy-count')
  return data
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<AwardCategory> {
  const { data } = await apiClient.patch<AwardCategory>(`/awards/categories/${id}`, { isActive })
  return data
}

export async function castVote(categoryId: string, votedForId: string): Promise<void> {
  await apiClient.put(`/awards/categories/${categoryId}/vote`, { votedForId })
}
