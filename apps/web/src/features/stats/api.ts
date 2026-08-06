import { apiClient } from '@/lib/api-client'
import type { MonthlyChallenges, PlayerStats, TeamStats } from '@/lib/types'

export async function fetchPlayerStats(season?: string): Promise<PlayerStats[]> {
  const { data } = await apiClient.get<PlayerStats[]>('/stats/players', { params: { season } })
  return data
}

export async function fetchTeamStats(season?: string): Promise<TeamStats> {
  const { data } = await apiClient.get<TeamStats>('/stats/team', { params: { season } })
  return data
}

export interface AvailableSeasons {
  seasons: string[]
  current: string
}

export async function fetchAvailableSeasons(): Promise<AvailableSeasons> {
  const { data } = await apiClient.get<AvailableSeasons>('/stats/seasons')
  return data
}

export async function fetchMonthlyChallenges(): Promise<MonthlyChallenges> {
  const { data } = await apiClient.get<MonthlyChallenges>('/stats/monthly-challenges')
  return data
}
