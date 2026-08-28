import { apiClient } from '@/lib/api-client'
import type { PlayerSubPosition, TrainingTeamAssignment } from '@/lib/types'

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

/** Post-training reconciliation against the coach's pointage réel — removes no-shows,
 * adds last-minute arrivals, leaves everyone else's team untouched. Distinct from
 * generateTeams, which fully re-balances from scratch (right pre-kickoff, wrong after). */
export async function confirmFinalTeams(sessionId: string): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.patch<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams/confirm`,
  )
  return data
}

/** Removes one guest slot immediately — unlike a real player, a guest has no status to flip
 * and wait for the next Régénérer/Confirmer, so this takes effect right away. */
export async function removeGuestFromTeam(
  sessionId: string,
  assignmentId: string,
): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.delete<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams/${assignmentId}`,
  )
  return data
}

/** Adds someone who showed up without being on the original list at all — no app account,
 * nobody registered them as a guest either. Placed straight onto whichever team is
 * thinnest, same as generateTeams/confirmFinalTeams's other guest/newcomer placement. */
export async function addWalkIn(
  sessionId: string,
  input: { firstName: string; lastName?: string; position?: PlayerSubPosition },
): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.post<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams/walk-in`,
    input,
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
