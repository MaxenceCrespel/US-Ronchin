export type UserRole = 'PLAYER' | 'COACH' | 'SUPERADMIN'
export type PreferredFoot = 'LEFT' | 'RIGHT' | 'BOTH'
export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'
export type PlayerSubPosition =
  | 'GOALKEEPER'
  | 'CENTER_BACK'
  | 'RIGHT_BACK'
  | 'LEFT_BACK'
  | 'DEFENSIVE_MIDFIELDER'
  | 'CENTER_MIDFIELDER'
  | 'RIGHT_MIDFIELDER'
  | 'LEFT_MIDFIELDER'
  | 'ATTACKING_MIDFIELDER'
  | 'RIGHT_WINGER'
  | 'LEFT_WINGER'
  | 'STRIKER'

export type UserStatus = 'ACTIVE' | 'PENDING'

export interface User {
  id: string
  email: string
  role: UserRole
  isPlayingCoach: boolean
  status: UserStatus
  firstName: string
  lastName: string
  isLicensed: boolean
  licenseNumber: string | null
  positions: PlayerSubPosition[]
  jerseyNumber: number | null
  preferredFoot: PreferredFoot | null
  birthDate: string | null
  avatarUrl: string | null
  accountActivated: boolean
  hasSeenOnboarding: boolean
  createdAt: string
  updatedAt: string
}

export type TrainingType = 'RECURRING' | 'ONE_OFF'

export interface Training {
  id: string
  title: string
  type: TrainingType
  location: string
  dayOfWeek: number | null
  startTime: string
  endTime: string
  startDate: string
  endDate: string | null
  createdBy: string
}

export interface TrainingSession {
  id: string
  trainingId: string | null
  date: string
  startTime: string
  endTime: string
  location: string
  cancelled: boolean
  /** Score du match d'entraînement (équipe 0 vs équipe 1) — null tant que le coach ne l'a
   * pas saisi, alimente le classement (voir TrainingRankingEntry / /training-ranking). */
  scoreTeam0: number | null
  scoreTeam1: number | null
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'MAYBE'

export interface AttendanceGuest {
  id: string
  firstName: string
  lastName: string | null
  position: PlayerSubPosition | null
}

/** A friendly-match "+1" — same idea as AttendanceGuest for trainings, but no position
 * field: unlike training team-balancing, match composition is a manual coach step
 * afterwards, not an automatic band-coverage pass. */
export interface MatchAttendanceGuest {
  id: string
  firstName: string
  lastName: string | null
}

export interface Attendance {
  id: string
  trainingSessionId: string
  userId: string
  user: User
  status: AttendanceStatus | null
  actualStatus: AttendanceStatus | null
  guestCount: number
  guests: AttendanceGuest[]
  respondedAt: string
}

export interface MatchAttendance {
  id: string
  matchId: string
  userId: string
  user: User
  status: AttendanceStatus
  guestCount: number
  guests: MatchAttendanceGuest[]
  respondedAt: string
}

export type MatchSource = 'FRIENDLY' | 'OFFICIAL_FFF'
export type MatchHomeAway = 'HOME' | 'AWAY'
export type MatchStatus = 'SCHEDULED' | 'PLAYED'

export interface Match {
  id: string
  source: MatchSource
  fffMatchId: string | null
  date: string
  kickOffTime: string | null
  opponent: string
  homeAway: MatchHomeAway
  competition: string | null
  venue: string | null
  scoreHome: number | null
  scoreAway: number | null
  status: MatchStatus
  createdBy: string
}

export interface MatchComposition {
  id: string
  matchId: string
  userId: string | null
  user: User | null
  /** Set instead of userId/user for a player not yet registered in the app. */
  guestFirstName: string | null
  guestLastName: string | null
  isStarter: boolean
  position: PlayerPosition | null
  shirtNumber: number | null
  formationX: number | null
  formationY: number | null
  note: string | null
}

export type MatchEventType = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD'
export type GoalType = 'FOOT' | 'HEAD' | 'PENALTY' | 'OWN_GOAL'

export interface MatchEvent {
  id: string
  matchId: string
  type: MatchEventType
  userId: string | null
  user: User | null
  /** Set instead of userId/user for a player not yet registered in the app. */
  scorerName: string | null
  assistUserId: string | null
  assistUser: User | null
  minute: number | null
  goalType: GoalType | null
}

export interface PlayerStats {
  userId: string
  firstName: string
  lastName: string
  matchesPlayed: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  trainingsPresent: number
  trainingsResponded: number
  trainingAttendanceRate: number | null
  averageRating: number | null
  ratingsCount: number
  motmCount: number
  patronDefenseCount: number
  presenceStreak: number
  defensiveMatchesStarted: number
  cleanSheets: number
  goalsConceded: number
  skillScore: number | null
}

export interface MonthlyChallengeEntry {
  userId: string
  firstName: string
  lastName: string
  value: number
}

export interface MonthlyChallenges {
  topScorers: MonthlyChallengeEntry[]
  mostPresentPlayers: MonthlyChallengeEntry[]
}

export type BadgeCategory =
  | 'GOALS'
  | 'ASSISTS'
  | 'MOTM'
  | 'GOALKEEPER'
  | 'DEFENSE'
  | 'MIDFIELD'
  | 'ATTENDANCE'
  | 'EXPERIENCE'
  | 'DISCIPLINE'
  | 'IMPACT'
  | 'SPECIAL'

export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export interface BadgeStatus {
  key: string
  category: BadgeCategory
  rarity: BadgeRarity
  title: string
  description: string
  emoji: string
  earned: boolean
  earnedAt: string | null
  count: number
  progress: { current: number; target: number } | null
}

export type AccountTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'RUBY'

export interface AccountLevel {
  score: number
  tier: AccountTier
  nextTier: AccountTier | null
  nextTierScore: number | null
}

export interface PlayerRating {
  id: string
  matchId: string
  raterId: string
  ratedUserId: string
  rating: number
}

export interface RatingSummaryEntry {
  userId: string
  firstName: string
  lastName: string
  average: number | null
  count: number
}

export interface MotmResultEntry {
  /** Null when the winner is still a guest (no account linked yet). */
  userId: string | null
  firstName: string
  lastName: string
  votes: number
}

export interface MotmResponse {
  myVoteCompositionId: string | null
  revealed: boolean
  totalVotes: number
  totalPlayers: number
  votingClosesAt: string | null
  results: MotmResultEntry[] | null
}

export interface DefenseBossResultEntry {
  /** Null when the winner is still a guest (no account linked yet). */
  userId: string | null
  firstName: string
  lastName: string
  votes: number
}

export interface DefenseBossResponse {
  myVoteCompositionId: string | null
  revealed: boolean
  totalVotes: number
  totalPlayers: number
  votingClosesAt: string | null
  hasEligibleTargets: boolean
  results: DefenseBossResultEntry[] | null
}

export interface TrainingTeamAssignment {
  id: string
  trainingSessionId: string
  userId: string | null
  user: User | null
  guestLabel: string | null
  guestPosition: PlayerSubPosition | null
  teamIndex: number
}

export interface DuoStats {
  scorerId: string
  scorerName: string
  assistId: string
  assistName: string
  count: number
}

export interface TeamStats {
  topScorers: PlayerStats[]
  topAssists: PlayerStats[]
  mostDecisive: PlayerStats[]
  bestDuos: DuoStats[]
}

export interface ParsedMatchInfo {
  fffMatchId: string | null
  date: string | null
  kickOffTime: string | null
  competition: string | null
  venue: string | null
  opponent: string | null
  homeAway: MatchHomeAway
  scoreHome: number | null
  scoreAway: number | null
}

export interface ParsedCompositionEntry {
  pdfName: string
  licenseNumber: string
  jerseyNumber: number | null
  isStarter: boolean
  matchedUserId: string | null
}

export interface ParsedGoal {
  minute: number | null
  playerPdfName: string
  matchedUserId: string | null
  assistPdfName: string | null
  assistMatchedUserId: string | null
  goalType: GoalType | null
}

export interface ParsedCard {
  minute: number | null
  playerPdfName: string
  matchedUserId: string | null
  type: MatchEventType
  needsReview: boolean
}

export interface ParsedMatchSheet {
  matchInfo: ParsedMatchInfo
  composition: ParsedCompositionEntry[]
  goals: ParsedGoal[]
  cards: ParsedCard[]
}

export interface TeamStanding {
  id: string
  rank: number
  teamName: string
  isUs: boolean
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
}

export interface StandingsSyncLog {
  id: string
  runAt: string
  status: 'SUCCESS' | 'ERROR'
  teamsFound: number
  errorMessage: string | null
}

export interface AwardResultEntry {
  userId: string
  firstName: string
  lastName: string
  votes: number
}

export interface AwardCategory {
  id: string
  key: string
  title: string
  isActive: boolean
  createdAt: string
  myVoteUserId: string | null
  totalVotes: number
  results: AwardResultEntry[] | null
}

/** One row of the training-scrimmage ranking (GET /training-ranking) — points from
 * TeamBalancingService.pointsForResult, tallied across every scored TrainingSession. */
export interface TrainingRankingEntry {
  userId: string
  firstName: string
  lastName: string
  points: number
  sessionsPlayed: number
  wins: number
  draws: number
  losses: number
}
