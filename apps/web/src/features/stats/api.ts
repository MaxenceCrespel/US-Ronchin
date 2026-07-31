import { apiClient } from '@/lib/api-client'
import type { MonthlyChallenges, PlayerStats, TeamStats } from '@/lib/types'

export async function fetchPlayerStats(): Promise<PlayerStats[]> {
  const { data } = await apiClient.get<PlayerStats[]>('/stats/players')
  return data
}

export async function fetchTeamStats(): Promise<TeamStats> {
  const { data } = await apiClient.get<TeamStats>('/stats/team')
  return data
}

export async function fetchMonthlyChallenges(): Promise<MonthlyChallenges> {
  const { data } = await apiClient.get<MonthlyChallenges>('/stats/monthly-challenges')
  return data
}
