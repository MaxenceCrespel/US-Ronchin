import { apiClient } from '@/lib/api-client'
import type { PlayerToRate } from '@/lib/types'

export async function fetchMyPlayerRatings(): Promise<PlayerToRate[]> {
  const { data } = await apiClient.get<PlayerToRate[]>('/player-ratings/mine')
  return data
}

export async function setPlayerRating(playerId: string, rating: number): Promise<void> {
  await apiClient.put(`/player-ratings/${playerId}`, { rating })
}
