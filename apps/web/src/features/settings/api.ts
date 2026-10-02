import { apiClient } from '@/lib/api-client'

export interface ClubSettings {
  id: string
  fffTeamUrl: string | null
  fffChampionshipUrl: string | null
  fffCupUrl: string | null
  updatedAt: string
}

export async function fetchSettings(): Promise<ClubSettings> {
  const { data } = await apiClient.get<ClubSettings>('/settings')
  return data
}

export interface UpdateSettingsInput {
  fffTeamUrl?: string
  fffChampionshipUrl?: string
  fffCupUrl?: string
}

export async function updateSettings(input: UpdateSettingsInput): Promise<ClubSettings> {
  const { data } = await apiClient.patch<ClubSettings>('/settings', input)
  return data
}

export interface FffSyncLog {
  id: string
  runAt: string
  status: 'SUCCESS' | 'ERROR'
  matchesFound: number
  matchesCreated: number
  matchesUpdated: number
  errorMessage: string | null
}

export async function runFffSync(): Promise<FffSyncLog> {
  const { data } = await apiClient.post<FffSyncLog>('/fff-sync/run')
  return data
}

export async function fetchFffSyncLogs(limit = 5): Promise<FffSyncLog[]> {
  const { data } = await apiClient.get<FffSyncLog[]>('/fff-sync/logs', { params: { limit } })
  return data
}
