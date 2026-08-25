import { apiClient } from '@/lib/api-client'
import type {
  AttendanceStatus,
  GoalType,
  Match,
  MatchAttendance,
  MatchComposition,
  MatchEvent,
  MatchEventType,
  MatchHomeAway,
  MatchSource,
  MatchStatus,
  MotmResponse,
  DefenseBossResponse,
  PlayerPosition,
  PlayerRating,
  RatingSummaryEntry,
} from '@/lib/types'

export async function fetchMatches(): Promise<Match[]> {
  const { data } = await apiClient.get<Match[]>('/matches')
  return data
}

export async function fetchMatch(id: string): Promise<Match> {
  const { data } = await apiClient.get<Match>(`/matches/${id}`)
  return data
}

export interface CreateMatchInput {
  date: string
  kickOffTime?: string
  opponent: string
  homeAway: MatchHomeAway
  competition?: string
  venue?: string
  source?: MatchSource
  fffMatchId?: string
}

export async function createMatch(input: CreateMatchInput): Promise<Match> {
  const { data } = await apiClient.post<Match>('/matches', input)
  return data
}

export interface UpdateMatchInput {
  date?: string
  kickOffTime?: string
  opponent?: string
  homeAway?: MatchHomeAway
  competition?: string
  venue?: string
  scoreHome?: number
  scoreAway?: number
  status?: MatchStatus
}

export async function updateMatch(id: string, input: UpdateMatchInput): Promise<Match> {
  const { data } = await apiClient.patch<Match>(`/matches/${id}`, input)
  return data
}

export async function deleteMatch(id: string): Promise<void> {
  await apiClient.delete(`/matches/${id}`)
}

export async function fetchComposition(matchId: string): Promise<MatchComposition[]> {
  const { data } = await apiClient.get<MatchComposition[]>(`/matches/${matchId}/composition`)
  return data
}

export interface CompositionEntryInput {
  userId: string
  isStarter: boolean
  position?: PlayerPosition
  shirtNumber?: number
  formationX?: number
  formationY?: number
  note?: string
}

export async function setComposition(
  matchId: string,
  entries: CompositionEntryInput[],
): Promise<MatchComposition[]> {
  const { data } = await apiClient.post<MatchComposition[]>(`/matches/${matchId}/composition`, {
    entries,
  })
  return data
}

export async function fetchEvents(matchId: string): Promise<MatchEvent[]> {
  const { data } = await apiClient.get<MatchEvent[]>(`/matches/${matchId}/events`)
  return data
}

export interface CreateEventInput {
  type: MatchEventType
  userId?: string
  scorerName?: string
  assistUserId?: string
  minute?: number
  goalType?: GoalType
}

export async function addEvent(matchId: string, input: CreateEventInput): Promise<MatchEvent> {
  const { data } = await apiClient.post<MatchEvent>(`/matches/${matchId}/events`, input)
  return data
}

export async function deleteEvent(matchId: string, eventId: string): Promise<void> {
  await apiClient.delete(`/matches/${matchId}/events/${eventId}`)
}

export async function fetchMyRatings(matchId: string): Promise<PlayerRating[]> {
  const { data } = await apiClient.get<PlayerRating[]>(`/matches/${matchId}/ratings/me`)
  return data
}

export async function ratePlayer(
  matchId: string,
  ratedUserId: string,
  rating: number,
): Promise<PlayerRating> {
  const { data } = await apiClient.post<PlayerRating>(`/matches/${matchId}/ratings`, {
    ratedUserId,
    rating,
  })
  return data
}

export async function fetchRatingsSubmitted(matchId: string): Promise<boolean> {
  const { data } = await apiClient.get<{ submitted: boolean }>(
    `/matches/${matchId}/ratings/submitted`,
  )
  return data.submitted
}

export async function submitRatings(
  matchId: string,
  ratings: { ratedUserId: string; rating: number }[],
): Promise<PlayerRating[]> {
  const { data } = await apiClient.post<PlayerRating[]>(`/matches/${matchId}/ratings/submit`, {
    ratings,
  })
  return data
}

export async function fetchMatchAttendance(matchId: string): Promise<MatchAttendance[]> {
  const { data } = await apiClient.get<MatchAttendance[]>(`/matches/${matchId}/attendance`)
  return data
}

export async function setMyMatchAttendance(
  matchId: string,
  status: AttendanceStatus,
): Promise<MatchAttendance> {
  const { data } = await apiClient.put<MatchAttendance>(`/matches/${matchId}/attendance`, {
    status,
  })
  return data
}

export async function fetchRatingsSummary(matchId: string): Promise<RatingSummaryEntry[]> {
  const { data } = await apiClient.get<RatingSummaryEntry[]>(`/matches/${matchId}/ratings/summary`)
  return data
}

export async function fetchMotm(matchId: string): Promise<MotmResponse> {
  const { data } = await apiClient.get<MotmResponse>(`/matches/${matchId}/motm`)
  return data
}

export async function voteMotm(matchId: string, votedForId: string): Promise<void> {
  await apiClient.put(`/matches/${matchId}/motm`, { votedForId })
}

export async function fetchDefenseBoss(matchId: string): Promise<DefenseBossResponse> {
  const { data } = await apiClient.get<DefenseBossResponse>(`/matches/${matchId}/defense-boss`)
  return data
}

export async function voteDefenseBoss(matchId: string, votedForId: string): Promise<void> {
  await apiClient.put(`/matches/${matchId}/defense-boss`, { votedForId })
}
