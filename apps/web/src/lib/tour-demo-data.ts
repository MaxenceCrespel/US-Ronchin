import { addDays, endOfWeek, format, startOfWeek } from 'date-fns'
import type {
  Attendance,
  BadgeStatus,
  Match,
  MonthlyChallenges,
  PlayerStats,
  TeamStats,
  TrainingSession,
  User,
} from './types'

/** Query cache entries injected while the onboarding tour is open, so the real pages have
 * something rich to show even on a brand-new club — swapped back out for real data on close. */
export interface DemoEntry {
  key: unknown[]
  data: unknown
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function fakeUser(overrides: Partial<User> & Pick<User, 'id' | 'firstName' | 'lastName'>): User {
  return {
    email: `${overrides.firstName.toLowerCase()}@exemple.fr`,
    role: 'PLAYER',
    isPlayingCoach: false,
    status: 'ACTIVE',
    isLicensed: true,
    licenseNumber: null,
    positions: [],
    jerseyNumber: null,
    preferredFoot: null,
    birthDate: null,
    avatarUrl: null,
    accountActivated: true,
    hasSeenOnboarding: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildTourDemoData(currentUser: User): DemoEntry[] {
  const today = new Date()
  const todayKey = iso(today)
  const in3WeeksKey = iso(addDays(today, 21))
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

  const fabien = fakeUser({ id: 'demo-fabien', firstName: 'Fabien', lastName: 'Caboche', jerseyNumber: 6, positions: ['CENTER_BACK'] })
  const vincent = fakeUser({ id: 'demo-vincent', firstName: 'Vincent', lastName: 'Ringalle', jerseyNumber: 9, positions: ['STRIKER'] })
  const mehdi = fakeUser({ id: 'demo-mehdi', firstName: 'Mehdi', lastName: 'Choloux', jerseyNumber: 4, positions: ['CENTER_BACK'] })
  const yann = fakeUser({
    id: 'demo-yann',
    firstName: 'Yann',
    lastName: 'Cuisinier',
    role: 'COACH',
    isPlayingCoach: true,
    jerseyNumber: 11,
    positions: ['STRIKER'],
  })
  const me: User = { ...currentUser }

  const session: TrainingSession = {
    id: 'demo-session',
    trainingId: null,
    date: todayKey,
    startTime: '19:00:00',
    endTime: '20:30:00',
    location: 'Stade Delory',
    cancelled: false,
  }

  const matches: Match[] = [
    {
      id: 'demo-match-1',
      source: 'OFFICIAL_FFF',
      fffMatchId: null,
      date: iso(addDays(today, -9)),
      kickOffTime: '15:00:00',
      opponent: 'FC Emmerin',
      homeAway: 'HOME',
      competition: 'Championnat',
      venue: 'Stade Delory',
      scoreHome: 3,
      scoreAway: 1,
      status: 'PLAYED',
      createdBy: me.id,
    },
    {
      id: 'demo-match-2',
      source: 'OFFICIAL_FFF',
      fffMatchId: null,
      date: iso(addDays(today, -16)),
      kickOffTime: '15:00:00',
      opponent: 'US Deûlémont',
      homeAway: 'AWAY',
      competition: 'Coupe',
      venue: 'Stade Deûlémont',
      scoreHome: 1,
      scoreAway: 1,
      status: 'PLAYED',
      createdBy: me.id,
    },
    {
      id: 'demo-match-3',
      source: 'FRIENDLY',
      fffMatchId: null,
      date: iso(addDays(today, -23)),
      kickOffTime: '15:00:00',
      opponent: 'ES Wattignies',
      homeAway: 'HOME',
      competition: null,
      venue: 'Stade Delory',
      scoreHome: 4,
      scoreAway: 0,
      status: 'PLAYED',
      createdBy: me.id,
    },
    {
      id: 'demo-match-4',
      source: 'OFFICIAL_FFF',
      fffMatchId: null,
      date: iso(addDays(today, 12)),
      kickOffTime: '15:00:00',
      opponent: 'Wavrin Don JS',
      homeAway: 'AWAY',
      competition: 'Championnat',
      venue: 'Stade Wavrin',
      scoreHome: null,
      scoreAway: null,
      status: 'SCHEDULED',
      createdBy: me.id,
    },
  ]

  const playerStats: PlayerStats[] = [
    { userId: me.id, firstName: me.firstName, lastName: me.lastName, matchesPlayed: 9, goals: 6, assists: 3, yellowCards: 1, redCards: 0, trainingsPresent: 12, trainingsResponded: 13, trainingAttendanceRate: 0.92, averageRating: 6.8, ratingsCount: 9, motmCount: 2, patronDefenseCount: 0, presenceStreak: 11, skillScore: 68 },
    { userId: fabien.id, firstName: fabien.firstName, lastName: fabien.lastName, matchesPlayed: 10, goals: 9, assists: 2, yellowCards: 2, redCards: 0, trainingsPresent: 14, trainingsResponded: 14, trainingAttendanceRate: 1, averageRating: 7.1, ratingsCount: 10, motmCount: 3, patronDefenseCount: 1, presenceStreak: 14, skillScore: 74 },
    { userId: vincent.id, firstName: vincent.firstName, lastName: vincent.lastName, matchesPlayed: 8, goals: 2, assists: 8, yellowCards: 0, redCards: 0, trainingsPresent: 11, trainingsResponded: 12, trainingAttendanceRate: 0.92, averageRating: 6.5, ratingsCount: 8, motmCount: 1, patronDefenseCount: 2, presenceStreak: 3, skillScore: 62 },
    { userId: mehdi.id, firstName: mehdi.firstName, lastName: mehdi.lastName, matchesPlayed: 6, goals: 0, assists: 1, yellowCards: 1, redCards: 0, trainingsPresent: 9, trainingsResponded: 11, trainingAttendanceRate: 0.82, averageRating: 5.9, ratingsCount: 6, motmCount: 0, patronDefenseCount: 0, presenceStreak: 0, skillScore: 51 },
    { userId: yann.id, firstName: yann.firstName, lastName: yann.lastName, matchesPlayed: 10, goals: 4, assists: 5, yellowCards: 0, redCards: 0, trainingsPresent: 13, trainingsResponded: 13, trainingAttendanceRate: 1, averageRating: 7.4, ratingsCount: 10, motmCount: 4, patronDefenseCount: 0, presenceStreak: 13, skillScore: 79 },
  ]

  const teamStats: TeamStats = {
    topScorers: [...playerStats].sort((a, b) => b.goals - a.goals).slice(0, 3),
    topAssists: [...playerStats].sort((a, b) => b.assists - a.assists).slice(0, 3),
    mostDecisive: [...playerStats].sort((a, b) => b.goals + b.assists - (a.goals + a.assists)).slice(0, 3),
    bestDuos: [
      { scorerId: fabien.id, scorerName: 'Fabien Caboche', assistId: vincent.id, assistName: 'Vincent Ringalle', count: 3 },
    ],
  }

  const monthlyChallenges: MonthlyChallenges = {
    topScorers: [{ userId: fabien.id, firstName: fabien.firstName, lastName: fabien.lastName, value: 4 }],
    mostPresentPlayers: [{ userId: yann.id, firstName: yann.firstName, lastName: yann.lastName, value: 4 }],
  }

  const players: User[] = [me, fabien, vincent, mehdi, yann]

  const attendances: Attendance[] = [
    { id: 'demo-att-1', trainingSessionId: session.id, userId: fabien.id, user: fabien, status: 'PRESENT', actualStatus: null, guestCount: 0, guests: [], respondedAt: new Date().toISOString() },
    { id: 'demo-att-2', trainingSessionId: session.id, userId: vincent.id, user: vincent, status: 'PRESENT', actualStatus: null, guestCount: 1, guests: [{ id: 'demo-guest-1', firstName: 'Léo', lastName: null }], respondedAt: new Date().toISOString() },
    { id: 'demo-att-3', trainingSessionId: session.id, userId: mehdi.id, user: mehdi, status: 'MAYBE', actualStatus: null, guestCount: 0, guests: [], respondedAt: new Date().toISOString() },
  ]

  const badges: BadgeStatus[] = [
    { key: 'first_goal', category: 'GOALS', rarity: 'COMMON', title: 'Premier but', description: 'Marquer ton premier but', emoji: '⚽', earned: true, earnedAt: iso(addDays(today, -60)), count: 1, progress: null },
    { key: 'hat_trick', category: 'GOALS', rarity: 'RARE', title: 'Le Coup du Chapeau', description: 'Marquer 3 buts dans un seul match', emoji: '🎩', earned: true, earnedAt: iso(addDays(today, -30)), count: 1, progress: null },
    { key: 'streak_10', category: 'ATTENDANCE', rarity: 'RARE', title: 'Machine de guerre', description: "10 entraînements d'affilée sans absence", emoji: '⚡', earned: true, earnedAt: iso(addDays(today, -5)), count: 1, progress: { current: 10, target: 10 } },
    { key: 'motm_first', category: 'MOTM', rarity: 'COMMON', title: 'Homme du match', description: 'Être élu homme du match', emoji: '👑', earned: true, earnedAt: iso(addDays(today, -9)), count: 1, progress: null },
    { key: 'porte_bonheur', category: 'IMPACT', rarity: 'COMMON', title: 'Le Porte-Bonheur', description: 'Être sur la feuille de match lors de 3 victoires consécutives', emoji: '🍀', earned: false, earnedAt: null, count: 0, progress: null },
    { key: 'goat', category: 'GOALS', rarity: 'LEGENDARY', title: 'La Légende (G.O.A.T.)', description: '50 buts dans la saison — bon courage', emoji: '🐐', earned: false, earnedAt: null, count: 0, progress: { current: 6, target: 50 } },
    { key: 'sang_froid', category: 'DISCIPLINE', rarity: 'EPIC', title: 'Sang-Froid', description: "20 matchs d'affilée sans le moindre carton", emoji: '🧊', earned: false, earnedAt: null, count: 0, progress: null },
    { key: 'pere_noel', category: 'ASSISTS', rarity: 'EPIC', title: 'Le Père Noël', description: '5 passes décisives de suite sans marquer', emoji: '🎅', earned: false, earnedAt: null, count: 0, progress: null },
  ]

  return [
    { key: ['training-sessions', todayKey, in3WeeksKey], data: [session] },
    { key: ['training-sessions', iso(weekStart), iso(weekEnd)], data: [session] },
    { key: ['matches'], data: matches },
    { key: ['stats', 'players'], data: playerStats },
    { key: ['stats', 'team'], data: teamStats },
    { key: ['monthly-challenges'], data: monthlyChallenges },
    { key: ['players'], data: players },
    { key: ['badges', currentUser.id], data: badges },
    { key: ['attendances', session.id], data: attendances },
    { key: ['teams', session.id], data: [] },
  ]
}
