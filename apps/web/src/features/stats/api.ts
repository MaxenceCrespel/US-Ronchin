import { apiClient } from '@/lib/api-client'
import type {
  MonthlyChallenges,
  MonthlyStatTrophy,
  MonthlyStatTrophyWinner,
  PlayerStats,
  TeamStats,
} from '@/lib/types'

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

export async function fetchMyAttendanceTrophies(): Promise<MonthlyStatTrophy[]> {
  const { data } = await apiClient.get<MonthlyStatTrophy[]>('/stats/my-attendance-trophies')
  return data
}

export async function fetchMyTrainingChampionTrophies(): Promise<MonthlyStatTrophy[]> {
  const { data } = await apiClient.get<MonthlyStatTrophy[]>('/stats/my-training-champion-trophies')
  return data
}

export async function fetchLastAttendanceTrophyWinner(): Promise<MonthlyStatTrophyWinner | null> {
  const { data } = await apiClient.get<MonthlyStatTrophyWinner | null>('/stats/last-attendance-trophy-winner')
  return data
}

export async function fetchLastTrainingChampionWinner(): Promise<MonthlyStatTrophyWinner | null> {
  const { data } = await apiClient.get<MonthlyStatTrophyWinner | null>('/stats/last-training-champion-winner')
  return data
}
