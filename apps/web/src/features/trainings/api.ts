import { apiClient } from '@/lib/api-client'
import type {
  Attendance,
  AttendanceStatus,
  Training,
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
  }>,
): Promise<TrainingSession> {
  const { data } = await apiClient.patch<TrainingSession>(`/training-sessions/${id}`, input)
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
