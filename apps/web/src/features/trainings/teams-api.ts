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

/** Wipes the composition entirely — back to "not generated yet". Distinct from
 * generateTeams, which replaces it immediately with a fresh split instead of leaving it
 * empty. */
export async function deleteTeams(sessionId: string): Promise<void> {
  await apiClient.delete(`/training-sessions/${sessionId}/teams`)
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

export interface UnlinkedGuestMatch {
  assignmentId: string
  sessionId: string
  sessionDate: string
  guestLabel: string
}

/** Past training guest slots whose name exactly matches — someone who trained as an
 * unlinked guest before creating their own account. Coach-only. */
export async function fetchUnlinkedGuestMatches(
  firstName: string,
  lastName: string,
): Promise<UnlinkedGuestMatch[]> {
  const { data } = await apiClient.get<UnlinkedGuestMatch[]>('/training-guest-matches', {
    params: { firstName, lastName },
  })
  return data
}

/** Retroactively credits the chosen past guest slots to this account — each becomes a real
 * assignment, counted in that player's training ranking/history from then on. */
export async function linkPastGuestTrainings(
  userId: string,
  assignmentIds: string[],
): Promise<{ linkedCount: number }> {
  const { data } = await apiClient.post<{ linkedCount: number }>('/training-guest-matches/link', {
    userId,
    assignmentIds,
  })
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
