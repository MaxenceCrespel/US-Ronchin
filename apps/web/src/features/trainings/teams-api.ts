import { apiClient } from '@/lib/api-client'
import type { TrainingTeamAssignment } from '@/lib/types'

export async function fetchTeams(sessionId: string): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.get<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams`,
  )
  return data
}

export async function generateTeams(
  sessionId: string,
  teamCount?: number,
): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.post<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams/generate`,
    { teamCount },
  )
  return data
}

export async function moveTeamPlayer(
  sessionId: string,
  assignmentId: string,
  teamIndex: number,
): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.patch<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams`,
    { assignmentId, teamIndex },
  )
  return data
}
