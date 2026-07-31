import { apiClient } from '@/lib/api-client'
import type { StandingsSyncLog, TeamStanding } from '@/lib/types'

export async function fetchStandings(): Promise<TeamStanding[]> {
  const { data } = await apiClient.get<TeamStanding[]>('/standings')
  return data
}

export async function syncStandings(): Promise<StandingsSyncLog> {
  const { data } = await apiClient.post<StandingsSyncLog>('/standings/sync')
  return data
}

export async function fetchStandingsLogs(limit = 1): Promise<StandingsSyncLog[]> {
  const { data } = await apiClient.get<StandingsSyncLog[]>('/standings/logs', { params: { limit } })
  return data
}
