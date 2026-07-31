import { apiClient } from '@/lib/api-client'
import type { AwardCategory } from '@/lib/types'

export async function fetchAwardCategories(): Promise<AwardCategory[]> {
  const { data } = await apiClient.get<AwardCategory[]>('/awards/categories')
  return data
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<AwardCategory> {
  const { data } = await apiClient.patch<AwardCategory>(`/awards/categories/${id}`, { isActive })
  return data
}

export async function castVote(categoryId: string, votedForId: string): Promise<void> {
  await apiClient.put(`/awards/categories/${categoryId}/vote`, { votedForId })
}
