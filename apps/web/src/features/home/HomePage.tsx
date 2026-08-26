import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import {
  UserCheck,
  AlertTriangle,
  ChevronRight,
  Dumbbell,
  Trophy,
  Vote,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { fetchSessions } from '@/features/trainings/api'
import { fetchComposition, fetchMatches, fetchMotm } from '@/features/matches/api'
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

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)

  // date-fns's format() reads local date parts — toISOString() would convert to UTC first
  // and shift the key back a day for anyone west of Paris at midnight-to-2am CEST.
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekStartKey = format(weekStart, 'yyyy-MM-dd')
  const weekEndKey = format(weekEnd, 'yyyy-MM-dd')

  const sessionsQuery = useQuery({
    queryKey: ['training-sessions', weekStartKey, weekEndKey],
    queryFn: () => fetchSessions(weekStartKey, weekEndKey),
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

  const weekEvents = useMemo(() => {
    const sessions = (sessionsQuery.data ?? []).map((s) => ({
      kind: 'session' as const,
      id: s.id,
      date: s.date,
      time: s.startTime,
      cancelled: s.cancelled,
      item: s,
    }))
    const matches = (matchesQuery.data ?? [])
      .filter((m) => m.date >= weekStartKey && m.date <= weekEndKey)
      .map((m) => ({
        kind: 'match' as const,
        id: m.id,
        date: m.date,
        time: m.kickOffTime ?? '00:00',
        cancelled: false,
        item: m,
      }))
    const now = Date.now()
    return [...sessions, ...matches]
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
      .map((event) => ({
        ...event,
        isPast: new Date(`${event.date}T${event.time}`).getTime() < now,
      }))
  }, [sessionsQuery.data, matchesQuery.data, weekStartKey, weekEndKey])

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
        <h2 className="mb-3 text-lg font-medium">📅 Programme de la semaine</h2>
        {sessionsQuery.isLoading || matchesQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : weekEvents.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-center text-sm">
              Rien de prévu cette semaine.
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col divide-y p-0">
              {weekEvents.map((event) => {
                const isMatch = event.kind === 'match'
                const dimmed = event.isPast || event.cancelled
                const subLabel = isMatch
                  ? (event.item.venue ?? (event.item.homeAway === 'HOME' ? 'Domicile' : 'Extérieur'))
                  : event.item.location

                return (
                  <Link
                    key={event.id}
                    to={isMatch ? `/matches/${event.id}` : '/trainings'}
                    className={cn(
                      'hover:bg-accent/50 flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                      dimmed && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        isMatch ? 'bg-club-gold/15 text-amber-700' : 'bg-club-blue/10 text-club-blue',
                      )}
                    >
                      {isMatch ? <Trophy className="size-4" /> : <Dumbbell className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {isMatch ? `vs ${event.item.opponent}` : 'Entraînement'}
                        {event.cancelled && ' (annulé)'}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs capitalize">
                        {formatDate(event.date)} · {event.time.slice(0, 5)}
                        {subLabel ? ` · ${subLabel}` : ''}
                      </span>
                    </span>
                    {isMatch && event.item.status === 'PLAYED' ? (
                      <span className="shrink-0 font-semibold">
                        {event.item.scoreHome ?? '-'} - {event.item.scoreAway ?? '-'}
                      </span>
                    ) : dimmed ? (
                      <Badge variant="secondary" className="shrink-0">
                        {event.cancelled ? 'Annulé' : 'Terminé'}
                      </Badge>
                    ) : (
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    )}
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        )}
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
