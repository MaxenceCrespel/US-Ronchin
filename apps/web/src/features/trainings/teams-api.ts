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

/** Drops one assignment from the team immediately — a guest who ends up not coming, or a
 * player who said "Présent" but isn't there. Doesn't touch the player's declared status
 * (the mismatch is what the "Beau Parleur" badge is for) — instead records it as an early
 * pointage réel (actualStatus: ABSENT), so a later "Régénérer" doesn't just put them right
 * back on a team. See the backend service for the full reasoning. */
export async function removeFromTeam(
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

/** Force-adds a specific roster player, marking them PRESENT along the way — the coach
 * saying someone's coming even though they never answered the poll (or answered something
 * else). The flip side of removeFromTeam. */
export async function addPlayerToTeam(
  sessionId: string,
  userId: string,
): Promise<TrainingTeamAssignment[]> {
  const { data } = await apiClient.post<TrainingTeamAssignment[]>(
    `/training-sessions/${sessionId}/teams/add-player`,
    { userId },
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
