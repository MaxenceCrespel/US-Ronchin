import { apiClient } from '@/lib/api-client'
import type {
  Attendance,
  AttendanceStatus,
  AttendanceStatusChangeEntry,
  Training,
  TrainingRankingEntry,
  TrainingSession,
  TrainingType,
} from '@/lib/types'

export async function fetchSessions(from?: string, to?: string): Promise<TrainingSession[]> {
  const { data } = await apiClient.get<TrainingSession[]>('/training-sessions', {
    params: { from, to },
  })
  return data
}

export async function fetchTrainings(): Promise<Training[]> {
  const { data } = await apiClient.get<Training[]>('/trainings')
  return data
}

export interface CreateTrainingInput {
  title: string
  type: TrainingType
  location: string
  dayOfWeek?: number
  startTime: string
  endTime: string
  startDate: string
  endDate?: string
  maxPresentPlayers?: number | null
}

export async function createTraining(input: CreateTrainingInput): Promise<Training> {
  const { data } = await apiClient.post<Training>('/trainings', input)
  return data
}

export async function deleteTraining(id: string): Promise<void> {
  await apiClient.delete(`/trainings/${id}`)
}

export async function updateSession(
  id: string,
  input: Partial<{
    date: string
    startTime: string
    endTime: string
    location: string
    cancelled: boolean
    scoreTeam0: number
    scoreTeam1: number
    maxPresentPlayersOverride: number | null
  }>,
): Promise<TrainingSession> {
  const { data } = await apiClient.patch<TrainingSession>(`/training-sessions/${id}`, input)
  return data
}

/** Classement global des matchs d'entraînement (points cumulés, voir
 * TeamBalancingService.getTrainingRanking) — trié par points décroissants. */
export async function fetchTrainingRanking(): Promise<TrainingRankingEntry[]> {
  const { data } = await apiClient.get<TrainingRankingEntry[]>('/training-ranking')
  return data
}

export async function deleteSession(id: string): Promise<void> {
  await apiClient.delete(`/training-sessions/${id}`)
}

export async function updateTraining(
  id: string,
  input: Partial<CreateTrainingInput>,
): Promise<Training> {
  const { data } = await apiClient.patch<Training>(`/trainings/${id}`, input)
  return data
}

export async function fetchAttendances(sessionId: string): Promise<Attendance[]> {
  const { data } = await apiClient.get<Attendance[]>(
    `/training-sessions/${sessionId}/attendance`,
  )
  return data
}

/** Coach-only trail of every declared-status change for a session — see
 * AttendanceStatusChangeEntry. */
export async function fetchAttendanceHistory(
  sessionId: string,
): Promise<AttendanceStatusChangeEntry[]> {
  const { data } = await apiClient.get<AttendanceStatusChangeEntry[]>(
    `/training-sessions/${sessionId}/attendance/history`,
  )
  return data
}

export async function setMyAttendance(
  sessionId: string,
  status: AttendanceStatus,
  guests?: { firstName: string; lastName?: string }[],
): Promise<Attendance> {
  const { data } = await apiClient.put<Attendance>(
    `/training-sessions/${sessionId}/attendance`,
    { status, guests },
  )
  return data
}

/** Coach-only: corrects a player's declared status (e.g. "said Present, isn't coming
 * after all") — bypasses the presence lock entirely, since fixing this before hitting
 * "Régénérer" is the whole point. Distinct from validateAttendance below, which records
 * the post-hoc real-attendance for stats/badges rather than editing what team generation
 * reads from. */
export async function coachSetAttendance(
  sessionId: string,
  userId: string,
  status: AttendanceStatus,
): Promise<Attendance> {
  const { data } = await apiClient.put<Attendance>(
    `/training-sessions/${sessionId}/attendance/${userId}`,
    { status },
  )
  return data
}

export async function validateAttendance(
  sessionId: string,
  userId: string,
  status: AttendanceStatus,
): Promise<Attendance> {
  const { data } = await apiClient.put<Attendance>(
    `/training-sessions/${sessionId}/attendance/${userId}/actual`,
    { status },
  )
  return data
}
