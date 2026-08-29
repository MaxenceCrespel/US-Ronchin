import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { UserCheck, AlertTriangle, ChevronRight, Trophy, Vote, Dumbbell, Clock, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { ATTENDANCE_STATUS_VARIANTS } from '@/lib/labels'
import type { AttendanceStatus, MatchSource } from '@/lib/types'
import { fetchSessions, fetchAttendances, setMyAttendance } from '@/features/trainings/api'
import { AttendanceToggle } from '@/features/trainings/TrainingsPage'
import {
  fetchComposition,
  fetchMatches,
  fetchMatchAttendance,
  fetchMotm,
  setMyMatchAttendance,
} from '@/features/matches/api'
import { fetchPlayerStats, fetchTeamStats } from '@/features/stats/api'
import { fetchPlayers } from '@/features/players/api'
import { MyStatsCard } from '@/features/stats/MyStatsCard'
import { MonthlyChallengesCard } from '@/features/stats/MonthlyChallengesCard'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function relativeDayLabel(dateKey: string, todayKey: string) {
  const diff = differenceInCalendarDays(new Date(`${dateKey}T00:00:00`), new Date(`${todayKey}T00:00:00`))
  if (diff <= 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  return `Dans ${diff} jours`
}

interface GuestNameInput {
  firstName: string
  lastName?: string
}

function UpcomingSessionCard({
  sessionId,
  date,
  startTime,
  endTime,
  location,
  todayKey,
}: {
  sessionId: string
  date: string
  startTime: string
  endTime: string
  location: string
  todayKey: string
}) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const attendancesQuery = useQuery({
    queryKey: ['attendances', sessionId],
    queryFn: () => fetchAttendances(sessionId),
  })

  const mutation = useMutation({
    mutationFn: (vars: { status: AttendanceStatus; guests: GuestNameInput[] }) =>
      setMyAttendance(sessionId, vars.status, vars.guests),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  // Same 30-min-before-kickoff lock as the dedicated Entraînements page — teams get
  // auto-generated at that point, so a later change would desync them from reality.
  const hasStarted = new Date(`${date}T${startTime}`).getTime() - 30 * 60_000 <= Date.now()

  const myAttendance = attendancesQuery.data?.find((a) => a.userId === currentUser?.id)
  const [guests, setGuests] = useState<GuestNameInput[]>([])
  const [newGuestFirstName, setNewGuestFirstName] = useState('')
  const [newGuestLastName, setNewGuestLastName] = useState('')
  useEffect(() => {
    setGuests(
      myAttendance?.guests.map((g) => ({ firstName: g.firstName, lastName: g.lastName ?? undefined })) ??
        [],
    )
  }, [myAttendance?.guests])

  const presentCount = attendancesQuery.data?.filter((a) => a.status === 'PRESENT').length ?? 0
  // Guests count regardless of the inviting player's own status — they can still show up
  // even if whoever registered them ends up not coming themselves.
  const guestTotal = attendancesQuery.data?.reduce((sum, a) => sum + a.guestCount, 0) ?? 0

  return (
    <Card className="border-club-blue/70 gap-0 overflow-hidden rounded-2xl border-l-4 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="bg-club-blue/10 text-club-blue animate-net-wobble flex size-9 shrink-0 items-center justify-center rounded-full">
              <Dumbbell className="size-4.5" />
            </span>
            <div>
              <p className="text-base font-semibold">Entraînement</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs capitalize">
                <span>{formatDate(date)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {startTime.slice(0, 5)} - {endTime.slice(0, 5)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {location}
                </span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="border-club-blue/40 text-club-blue shrink-0 whitespace-nowrap">
            {relativeDayLabel(date, todayKey)}
          </Badge>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3" data-tour="attendance-toggle">
          <AttendanceToggle
            value={myAttendance?.status}
            disabled={mutation.isPending || hasStarted}
            onChange={(status) => {
              // Guests aren't wiped on a status change anymore — a friend can still come
              // even if you end up Absent/Incertain yourself.
              mutation.mutate({ status, guests })
            }}
          />
          {hasStarted && (
            <p className="text-muted-foreground text-xs">
              Les équipes ont été générées — la présence ne peut plus être modifiée.
            </p>
          )}
          {mutation.isError && <p className="text-destructive text-xs">Échec — réessaie.</p>}
          {myAttendance?.status && (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">
                Quelqu'un vient avec toi (ou à ta place) ?
              </span>
              {guests.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {guests.map((g, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="bg-muted/60 rounded-full px-2 py-1">
                        {g.firstName}
                        {g.lastName ? ` ${g.lastName}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={mutation.isPending || hasStarted}
                        onClick={() => {
                          const next = guests.filter((_, idx) => idx !== i)
                          setGuests(next)
                          mutation.mutate({ status: myAttendance!.status!, guests: next })
                        }}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        aria-label="Retirer cet invité"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  placeholder="Prénom"
                  className="h-7 w-24 text-xs"
                  disabled={hasStarted}
                  value={newGuestFirstName}
                  onChange={(e) => setNewGuestFirstName(e.target.value)}
                />
                <Input
                  placeholder="Nom (optionnel)"
                  className="h-7 w-28 text-xs"
                  disabled={hasStarted}
                  value={newGuestLastName}
                  onChange={(e) => setNewGuestLastName(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={mutation.isPending || hasStarted || !newGuestFirstName.trim()}
                  onClick={() => {
                    const next = [
                      ...guests,
                      { firstName: newGuestFirstName.trim(), lastName: newGuestLastName.trim() || undefined },
                    ]
                    setGuests(next)
                    setNewGuestFirstName('')
                    setNewGuestLastName('')
                    mutation.mutate({ status: myAttendance!.status!, guests: next })
                  }}
                >
                  Ajouter
                </Button>
              </div>
            </div>
          )}
          {(presentCount > 0 || guestTotal > 0) && (
            <p className="text-muted-foreground text-xs">
              <strong className="text-foreground">{presentCount + guestTotal}</strong> sur le terrain
              {guestTotal > 0 &&
                ` (${presentCount} joueur${presentCount > 1 ? 's' : ''} + ${guestTotal} invité${guestTotal > 1 ? 's' : ''})`}
            </p>
          )}
        </div>

        <Link
          to={`/trainings?session=${sessionId}`}
          className="text-club-blue inline-flex items-center gap-1 self-start text-xs font-medium hover:underline"
        >
          Voir le pointage complet
          <ChevronRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  )
}

function UpcomingMatchCard({
  matchId,
  date,
  kickOffTime,
  opponent,
  homeAway,
  venue,
  source,
  todayKey,
}: {
  matchId: string
  date: string
  kickOffTime: string | null
  opponent: string
  homeAway: 'HOME' | 'AWAY'
  venue: string | null
  source: MatchSource
  todayKey: string
}) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const subLabel = venue ?? (homeAway === 'HOME' ? 'Domicile' : 'Extérieur')

  const attendanceQuery = useQuery({
    queryKey: ['match-attendance', matchId],
    queryFn: () => fetchMatchAttendance(matchId),
  })

  const mutation = useMutation({
    mutationFn: (vars: { status: AttendanceStatus; guests: GuestNameInput[] }) =>
      setMyMatchAttendance(matchId, vars.status, vars.guests),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match-attendance', matchId] }),
  })

  // Same rationale as training sessions: locked from 30 min before kickoff, the moment
  // the coach relies on declared presence to finalize the composition.
  const hasStarted = new Date(`${date}T${kickOffTime ?? '00:00'}`).getTime() - 30 * 60_000 <= Date.now()
  const myAttendance = attendanceQuery.data?.find((a) => a.userId === currentUser?.id)

  // Guests only make sense for a friendly — an officially licensed match can't field an
  // informal +1 (see MatchesService.setMyAttendance).
  const isFriendly = source === 'FRIENDLY'
  const [guests, setGuests] = useState<GuestNameInput[]>([])
  const [newGuestFirstName, setNewGuestFirstName] = useState('')
  const [newGuestLastName, setNewGuestLastName] = useState('')
  useEffect(() => {
    setGuests(
      myAttendance?.guests.map((g) => ({ firstName: g.firstName, lastName: g.lastName ?? undefined })) ??
        [],
    )
  }, [myAttendance?.guests])

  const presentCount = attendanceQuery.data?.filter((a) => a.status === 'PRESENT').length ?? 0
  const guestTotal = attendanceQuery.data?.reduce((sum, a) => sum + a.guestCount, 0) ?? 0

  return (
    <Card className="border-club-gold/70 gap-0 overflow-hidden rounded-2xl border-l-4 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="bg-club-gold/15 flex size-9 shrink-0 items-center justify-center rounded-full text-amber-700">
              <Trophy className="size-4.5" />
            </span>
            <div>
              <p className="text-base font-semibold">vs {opponent}</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs capitalize">
                <span>{formatDate(date)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {(kickOffTime ?? '00:00').slice(0, 5)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {subLabel}
                </span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="border-club-gold/50 shrink-0 whitespace-nowrap text-amber-700">
            {relativeDayLabel(date, todayKey)}
          </Badge>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <AttendanceToggle
            value={myAttendance?.status}
            disabled={mutation.isPending || hasStarted}
            onChange={(status) => mutation.mutate({ status, guests })}
          />
          {hasStarted && (
            <p className="text-muted-foreground text-xs">
              Le match a commencé — la présence ne peut plus être modifiée.
            </p>
          )}
          {mutation.isError && <p className="text-destructive text-xs">Échec — réessaie.</p>}
          {isFriendly && myAttendance?.status && (
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">
                Quelqu'un vient avec toi (ou à ta place) ?
              </span>
              {guests.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {guests.map((g, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="bg-muted/60 rounded-full px-2 py-1">
                        {g.firstName}
                        {g.lastName ? ` ${g.lastName}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={mutation.isPending || hasStarted}
                        onClick={() => {
                          const next = guests.filter((_, idx) => idx !== i)
                          setGuests(next)
                          mutation.mutate({ status: myAttendance!.status!, guests: next })
                        }}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        aria-label="Retirer cet invité"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  placeholder="Prénom"
                  className="h-7 w-24 text-xs"
                  disabled={hasStarted}
                  value={newGuestFirstName}
                  onChange={(e) => setNewGuestFirstName(e.target.value)}
                />
                <Input
                  placeholder="Nom (optionnel)"
                  className="h-7 w-28 text-xs"
                  disabled={hasStarted}
                  value={newGuestLastName}
                  onChange={(e) => setNewGuestLastName(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={mutation.isPending || hasStarted || !newGuestFirstName.trim()}
                  onClick={() => {
                    const next = [
                      ...guests,
                      { firstName: newGuestFirstName.trim(), lastName: newGuestLastName.trim() || undefined },
                    ]
                    setGuests(next)
                    setNewGuestFirstName('')
                    setNewGuestLastName('')
                    mutation.mutate({ status: myAttendance!.status!, guests: next })
                  }}
                >
                  Ajouter
                </Button>
              </div>
            </div>
          )}
          {attendanceQuery.data && attendanceQuery.data.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attendanceQuery.data.map((a) => (
                <Badge key={a.id} variant={ATTENDANCE_STATUS_VARIANTS[a.status]} className="animate-pop-in">
                  {a.user.firstName} {a.user.lastName[0]}.
                  {a.guests.length > 0 && ` +${a.guests.map((g) => g.firstName).join(', ')}`}
                </Badge>
              ))}
            </div>
          )}
          {(presentCount > 0 || guestTotal > 0) && (
            <p className="text-muted-foreground text-xs">
              {presentCount} joueur{presentCount > 1 ? 's' : ''}
              {guestTotal > 0 && (
                <>
                  {' '}
                  + {guestTotal} invité{guestTotal > 1 ? 's' : ''}
                </>
              )}
              {' = '}
              <strong className="text-foreground">{presentCount + guestTotal} sur le terrain</strong>
            </p>
          )}
        </div>

        <Link
          to={`/matches/${matchId}`}
          className="text-club-blue inline-flex items-center gap-1 self-start text-xs font-medium hover:underline"
        >
          Voir la fiche du match
          <ChevronRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  )
}

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)

  // date-fns's format() reads local date parts — toISOString() would convert to UTC first
  // and shift the key back a day for anyone west of Paris at midnight-to-2am CEST.
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  // Wide enough window to always have 3 upcoming sessions to show, even with a low
  // weekly training cadence — recomputed daily since todayKey changes, so the query
  // key stays stable within a day (no refetch loop).
  const upcomingRangeEndKey = format(addDays(new Date(), 60), 'yyyy-MM-dd')

  const sessionsQuery = useQuery({
    queryKey: ['training-sessions', todayKey, upcomingRangeEndKey],
    queryFn: () => fetchSessions(todayKey, upcomingRangeEndKey),
  })
  const matchesQuery = useQuery({ queryKey: ['matches'], queryFn: fetchMatches })
  const playerStatsQuery = useQuery({
    queryKey: ['stats', 'players'],
    queryFn: () => fetchPlayerStats(),
  })
  const teamStatsQuery = useQuery({ queryKey: ['stats', 'team'], queryFn: () => fetchTeamStats() })
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers, enabled: isCoach })

  const myStats = playerStatsQuery.data?.find((p) => p.userId === user?.id)

  const pendingPlayers = (playersQuery.data ?? []).filter((p) => p.status === 'PENDING')
  const matchesNeedingResult = (matchesQuery.data ?? [])
    .filter((m) => m.status !== 'PLAYED' && m.date < todayKey)
    .sort((a, b) => b.date.localeCompare(a.date))

  const recentPlayedMatches = useMemo(
    () =>
      (matchesQuery.data ?? [])
        .filter((m) => m.status === 'PLAYED')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [matchesQuery.data],
  )
  const compositionQueries = useQueries({
    queries: !isCoach
      ? recentPlayedMatches.map((m) => ({
          queryKey: ['composition', m.id],
          queryFn: () => fetchComposition(m.id),
        }))
      : [],
  })
  const motmQueries = useQueries({
    queries: !isCoach
      ? recentPlayedMatches.map((m) => ({
          queryKey: ['motm', m.id],
          queryFn: () => fetchMotm(m.id),
        }))
      : [],
  })
  const matchesNeedingVote = isCoach
    ? []
    : recentPlayedMatches.filter((_m, i) => {
        const composition = compositionQueries[i]?.data
        const hasVoted = motmQueries[i]?.data?.myVoteCompositionId != null
        const revealed = motmQueries[i]?.data?.revealed ?? false
        const iPlayed = composition?.some((c) => c.userId === user?.id) ?? false
        // Once revealed (everyone voted, or the 24h window elapsed), voting is closed —
        // nothing left to do here even if this player never voted.
        return iPlayed && !!composition?.length && !hasVoted && !revealed
      })

  interface ActionItem {
    id: string
    icon: ComponentType<{ className?: string }>
    label: string
    to: string
  }

  const actionItems: ActionItem[] = isCoach
    ? [
        ...(pendingPlayers.length > 0
          ? [
              {
                id: 'pending-players',
                icon: UserCheck,
                label: `${pendingPlayers.length} joueur${pendingPlayers.length > 1 ? 's' : ''} en attente de validation`,
                to: '/players',
              },
            ]
          : []),
        ...matchesNeedingResult.slice(0, 3).map((m) => ({
          id: m.id,
          icon: Trophy,
          label: `Résultat à renseigner — vs ${m.opponent} (${formatDate(m.date)})`,
          to: `/matches/${m.id}`,
        })),
        ...(matchesNeedingResult.length > 3
          ? [
              {
                id: 'more-matches',
                icon: Trophy,
                label: `+${matchesNeedingResult.length - 3} autre${matchesNeedingResult.length - 3 > 1 ? 's' : ''} match${matchesNeedingResult.length - 3 > 1 ? 's' : ''} à renseigner`,
                to: '/matches',
              },
            ]
          : []),
      ]
    : matchesNeedingVote.map((m) => ({
        id: m.id,
        icon: Vote,
        label: `Vote & notes à faire — vs ${m.opponent} (${formatDate(m.date)})`,
        to: `/matches/${m.id}`,
      }))

  // Only ever the next 3 of each kind, and never anything already past — a cancelled
  // session isn't something to prepare for anymore, so it doesn't take up a slot either.
  const upcomingSessions = useMemo(() => {
    const now = Date.now()
    return (sessionsQuery.data ?? [])
      .filter((s) => !s.cancelled && new Date(`${s.date}T${s.startTime}`).getTime() >= now)
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
      .slice(0, 3)
  }, [sessionsQuery.data])

  const upcomingMatches = useMemo(() => {
    const now = Date.now()
    return (matchesQuery.data ?? [])
      .filter(
        (m) => m.status === 'SCHEDULED' && new Date(`${m.date}T${m.kickOffTime ?? '00:00'}`).getTime() >= now,
      )
      .sort((a, b) => (a.date === b.date ? (a.kickOffTime ?? '').localeCompare(b.kickOffTime ?? '') : a.date.localeCompare(b.date)))
      .slice(0, 3)
  }, [matchesQuery.data])

  const recentResults = useMemo(
    () =>
      (matchesQuery.data ?? [])
        .filter((m) => m.status === 'PLAYED')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3),
    [matchesQuery.data],
  )

  const topScorer = teamStatsQuery.data?.topScorers[0]
  const mostDecisive = teamStatsQuery.data?.mostDecisive[0]

  return (
    <div className="flex flex-col gap-6" data-tour="home-page">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()} {user?.firstName} 👋
        </h1>
        <p className="text-muted-foreground text-sm">
          {isCoach
            ? "Vue d'ensemble de l'équipe US Ronchin."
            : 'Voici ton récap personnalisé pour la suite.'}
        </p>
      </div>

      {actionItems.length > 0 && (
        <Card className="border-amber-300 py-0">
          <CardHeader className="border-b border-amber-200 bg-amber-50 py-3 [.border-b]:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-900">
              <AlertTriangle className="size-4" />
              À traiter
              <Badge className="ml-auto bg-amber-200 text-amber-900 hover:bg-amber-200">
                {actionItems.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y p-0">
            {actionItems.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className="hover:bg-amber-50/70 flex items-center gap-3 px-4 py-3 text-sm transition-colors"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <item.icon className="size-4" />
                </span>
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-medium">📅 À venir</h2>
        <Tabs defaultValue="trainings">
          <TabsList className="mb-3">
            <TabsTrigger value="trainings">
              <Dumbbell className="size-3.5" />
              Entraînements
            </TabsTrigger>
            <TabsTrigger value="matches">
              <Trophy className="size-3.5" />
              Matchs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trainings">
            {sessionsQuery.isLoading ? (
              <p className="text-muted-foreground text-sm">Chargement...</p>
            ) : upcomingSessions.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-6 text-center text-sm">
                  Aucun entraînement à venir.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {upcomingSessions.map((session) => (
                  <UpcomingSessionCard
                    key={session.id}
                    sessionId={session.id}
                    date={session.date}
                    startTime={session.startTime}
                    endTime={session.endTime}
                    location={session.location}
                    todayKey={todayKey}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="matches">
            {matchesQuery.isLoading ? (
              <p className="text-muted-foreground text-sm">Chargement...</p>
            ) : upcomingMatches.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-6 text-center text-sm">
                  Aucun match à venir.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {upcomingMatches.map((match) => (
                  <UpcomingMatchCard
                    key={match.id}
                    matchId={match.id}
                    date={match.date}
                    kickOffTime={match.kickOffTime}
                    opponent={match.opponent}
                    homeAway={match.homeAway}
                    venue={match.venue}
                    source={match.source}
                    todayKey={todayKey}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {myStats && <MyStatsCard stats={myStats} />}

      <MonthlyChallengesCard />

      {(topScorer || mostDecisive) && (
        <div>
          <h2 className="mb-3 text-lg font-medium">🏆 En vue chez les Ronchinois</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {topScorer && (
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Meilleur buteur</p>
                    <p className="font-medium">
                      {topScorer.firstName} {topScorer.lastName}
                    </p>
                  </div>
                  <Badge className="bg-club-gold text-white">{topScorer.goals} buts</Badge>
                </CardContent>
              </Card>
            )}
            {mostDecisive && (
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Joueur le plus décisif</p>
                    <p className="font-medium">
                      {mostDecisive.firstName} {mostDecisive.lastName}
                    </p>
                  </div>
                  <Badge className="bg-club-gold text-white">
                    {mostDecisive.goals + mostDecisive.assists} pts
                  </Badge>
                </CardContent>
              </Card>
            )}
          </div>
          <Link to="/stats" className="text-club-blue mt-2 inline-block text-sm hover:underline">
            Voir toutes les statistiques →
          </Link>
        </div>
      )}

      {recentResults.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-medium">Derniers résultats</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recentResults.map((match) => (
              <Link key={match.id} to={`/matches/${match.id}`}>
                <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">vs {match.opponent}</CardTitle>
                    <CardDescription className="capitalize">{formatDate(match.date)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
