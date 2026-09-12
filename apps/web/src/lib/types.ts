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
export type SeniorityTier = 'ONE_TO_THREE' | 'THREE_TO_SEVEN' | 'SEVEN_PLUS'

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
  /** Coach/admin-set — seniority bracket at the club (not derived from account age, the app
   * just launched). Null means "moins d'un an". Ranks below "licencié" and, within it,
   * ONE_TO_THREE < THREE_TO_SEVEN < SEVEN_PLUS when a training's headcount cap frees up a
   * slot. */
  seniorityTier: SeniorityTier | null
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
  /** Caps how many PRESENT responses count as confirmed for a session (e.g. 16 for a locked
   * 8v8) — licensed players prioritized, the rest waitlisted. Null means no cap. */
  maxPresentPlayers: number | null
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
  /** Flattened from the parent Training (a session doesn't own either) — null for an
   * ad-hoc session with no trainingId. */
  trainingType: TrainingType | null
  maxPresentPlayers: number | null
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
  /** False when status is PRESENT but the training's maxPresentPlayers cap is already full
   * and this player is on the waitlist — always true for a non-PRESENT status or when the
   * training has no cap. */
  confirmed: boolean
  /** How many of `guests` count toward the cap (0 to guestCount) — the rest (guestCount -
   * confirmedGuestCount) are waitlisted right alongside the player, same pool as `confirmed`. */
  confirmedGuestCount: number
}

/** One row of AttendanceStatusChange's append-only trail — see the API entity doc. */
export interface AttendanceStatusChangeEntry {
  id: string
  userId: string
  user: User
  changedBy: string
  changer: User
  previousStatus: AttendanceStatus | null
  newStatus: AttendanceStatus
  previousConfirmed: boolean
  newConfirmed: boolean
  previousConfirmedGuestCount: number
  newConfirmedGuestCount: number
  createdAt: string
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
  /** e.g. "Pelouse Naturelle"/"Pelouse Synthétique" — only ever known for an OFFICIAL_FFF
   * match, scraped alongside the venue itself; null for a friendly. */
  surface: string | null
  scoreHome: number | null
  scoreAway: number | null
  status: MatchStatus
  /** Set once the coach clicks "Terminer" at the end of the composition/events setup
   * wizard — voting (MOTM, patron de la défense, notes) only unlocks once this is set,
   * not just when status flips to PLAYED (that happens earlier, at score entry alone). */
  resultConfirmedAt: string | null
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

/** One past, fully-settled month the current player topped a stat-based monthly ranking —
 * GET /stats/my-attendance-trophies ("Assidu du mois") or
 * /stats/my-training-champion-trophies (most scrimmage points). No vote behind these, unlike
 * "Joueur du mois" — the winner is just whoever the numbers say, so there's no AwardCategory
 * row; `value` is the presence count or points that won that month. */
export interface MonthlyStatTrophy {
  month: string
  value: number
}

/** A stat trophy's winner(s) for the most recently settled month — "who actually won", for
 * anyone to see, not "did I win" (see MonthlyStatTrophy above). GET
 * /stats/last-attendance-trophy-winner or /stats/last-training-champion-winner. */
export interface MonthlyStatTrophyWinner {
  month: string
  value: number
  winners: { userId: string; firstName: string; lastName: string }[]
}

/** One recent confirmed match's revealed trophy winner(s) — GET
 * /matches/recent-trophy-winners. `null` for a kind still gated (vote not revealed yet) or
 * with nothing to show (no defender played that match). */
export interface MatchTrophyWinners {
  matchId: string
  date: string
  opponent: string
  homeAway: MatchHomeAway
  scoreHome: number | null
  scoreAway: number | null
  motmWinners: { userId: string; firstName: string; lastName: string }[] | null
  defenseBossWinners: { userId: string; firstName: string; lastName: string }[] | null
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

export interface BadgeHolder {
  userId: string
  firstName: string
  lastName: string
  count: number
  earnedAt: string
}

export interface BadgeHolderGroup {
  key: string
  category: BadgeCategory
  rarity: BadgeRarity
  title: string
  emoji: string
  holders: BadgeHolder[]
}

export interface PlayerTrainingHistoryEntry {
  sessionId: string
  date: string
  cancelled: boolean
  declaredStatus: AttendanceStatus | null
  actualStatus: AttendanceStatus | null
  teamIndex: number | null
  scoreTeam0: number | null
  scoreTeam1: number | null
  points: number | null
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
  ratedUserId: string | null
  ratedGuestId: string | null
  rating: number
}

export interface RatingSummaryEntry {
  /** Null when the rated player is still a guest (no account linked yet). */
  userId: string | null
  /** Stable key regardless of userId/guest status — the composition entry's own id. */
  compositionId: string
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
  mostPresent: PlayerStats[]
  /** Best average match rating, minimum 3 ratings — same confidence floor as skillScore. */
  topRated: PlayerStats[]
  mostMotm: PlayerStats[]
  mostPatronDefense: PlayerStats[]
  totalGoals: number
  totalAssists: number
  bestDuos: DuoStats[]
  /** Team record for the season — wins/draws/losses and goals for/against, from played
   * matches with a score entered. */
  record: {
    played: number
    wins: number
    draws: number
    losses: number
    goalsFor: number
    goalsAgainst: number
  }
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
  season: string | null
  isActive: boolean
  closedAt: string | null
  createdAt: string
  myVoteUserId: string | null
  totalVotes: number
  results: AwardResultEntry[] | null
}

/** GET /awards/monthly — the month's fixed categories ("Joueur du mois" today, though the
 * shape stays a list in case a genuinely new monthly category shows up later), same shape as
 * AwardCategory (they *are* one each, just keyed differently with a shared "YYYY-MM" season).
 * `current` is however many of this month's votes are still open; `history` is every past
 * month's closed rows, most recent first, the trophy case's data source. "Homme du match" and
 * "Patron de la défense" are voted per match, not here — see MatchTrophyEntry below. */
export interface MonthlyAward {
  current: AwardCategory[]
  history: AwardCategory[]
}

/** GET /matches/my-trophies — every match the current player has actually won "Homme du
 * match" or "Patron de la défense" in, for their personal trophy case. `votes` is how many of
 * that match's votes went to them specifically (not the winning total, in a tie those are the
 * same number, but this is always this player's own count). */
export interface MatchTrophyEntry {
  matchId: string
  kind: 'motm' | 'defense_boss'
  date: string
  opponent: string
  homeAway: MatchHomeAway
  scoreHome: number | null
  scoreAway: number | null
  votes: number
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
