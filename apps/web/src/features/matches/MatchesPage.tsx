import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarX2, ChevronLeft, ChevronRight, FileUp, RefreshCw } from 'lucide-react'
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import type { MatchHomeAway } from '@/lib/types'
import {
  getMatchCategory,
  MATCH_CATEGORY_BORDER,
  MATCH_CATEGORY_FILL,
  MATCH_CATEGORY_LABELS,
} from '@/lib/match-category'
import { createMatch, fetchMatchAttendance, fetchMatches, fetchMotm } from './api'
import { fetchFffSyncLogs, runFffSync } from '@/features/settings/api'
import { VoteProgress } from './VoteProgress'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function FffSyncStatus() {
  const queryClient = useQueryClient()
  const logsQuery = useQuery({
    queryKey: ['fff-sync-logs'],
    queryFn: () => fetchFffSyncLogs(1),
  })

  const syncMutation = useMutation({
    mutationFn: runFffSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fff-sync-logs'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
    },
  })

  const lastLog = logsQuery.data?.[0]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={syncMutation.isPending}
        onClick={() => syncMutation.mutate()}
      >
        <RefreshCw className={syncMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
        Synchroniser le calendrier FFF
      </Button>
      {syncMutation.isError && (
        <span className="text-destructive text-xs">Échec du déclenchement de la synchro.</span>
      )}
      {!syncMutation.isPending && lastLog && (
        <span className="text-muted-foreground text-xs">
          Dernière synchro : {new Date(lastLog.runAt).toLocaleString('fr-FR')} —{' '}
          {lastLog.status === 'SUCCESS'
            ? `${lastLog.matchesCreated} créés, ${lastLog.matchesUpdated} mis à jour`
            : `échec (${lastLog.errorMessage})`}
        </span>
      )}
    </div>
  )
}

export function MatchesPage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)
  const queryClient = useQueryClient()
  const matchesQuery = useQuery({ queryKey: ['matches'], queryFn: fetchMatches })

  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
  const monthMatches = useMemo(() => {
    return (matchesQuery.data ?? []).filter((m) =>
      isSameMonth(new Date(`${m.date}T00:00:00`), selectedMonth),
    )
  }, [matchesQuery.data, selectedMonth])

  const playedMonthMatches = useMemo(
    () => monthMatches.filter((m) => m.status === 'PLAYED'),
    [monthMatches],
  )
  // One MOTM lookup per played match this month — bounded to a handful of cards, cheap
  // enough to fetch eagerly so the "temps restant" gauge shows without opening each match.
  const motmQueries = useQueries({
    queries: playedMonthMatches.map((m) => ({
      queryKey: ['motm', m.id],
      queryFn: () => fetchMotm(m.id),
      refetchInterval: 30000,
    })),
  })
  const motmByMatchId = new Map(playedMonthMatches.map((m, i) => [m.id, motmQueries[i]?.data]))

  const upcomingMonthMatches = useMemo(
    () => monthMatches.filter((m) => m.status !== 'PLAYED'),
    [monthMatches],
  )
  // Same bounded-eager-fetch rationale as the MOTM lookups above — a handful of cards this
  // month, cheap enough to show "X sur le terrain" without opening each match.
  const attendanceQueries = useQueries({
    queries: upcomingMonthMatches.map((m) => ({
      queryKey: ['match-attendance', m.id],
      queryFn: () => fetchMatchAttendance(m.id),
    })),
  })
  const attendanceByMatchId = new Map(
    upcomingMonthMatches.map((m, i) => [m.id, attendanceQueries[i]?.data]),
  )

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<MatchHomeAway>('HOME')
  const [venue, setVenue] = useState('')

  const createMutation = useMutation({
    mutationFn: () => createMatch({ date, opponent, homeAway, venue: venue || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      setOpen(false)
      setOpponent('')
      setVenue('')
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Matchs</h1>
        {isCoach && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild data-tour="matches-import">
              <Link to="/admin/import-pdf">
                <FileUp className="size-4" />
                Importer une feuille de match
              </Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-tour="matches-add">Ajouter un match amical</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau match amical</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  createMutation.mutate()
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="opponent">Adversaire</Label>
                  <Input
                    id="opponent"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Domicile / Extérieur</Label>
                  <Select
                    value={homeAway}
                    onValueChange={(v) => setHomeAway(v as MatchHomeAway)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOME">Domicile</SelectItem>
                      <SelectItem value="AWAY">Extérieur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="venue">Lieu (optionnel)</Label>
                  <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
                </div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Création...' : 'Créer le match'}
                </Button>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isCoach && <FffSyncStatus />}

      <div className="flex flex-wrap items-center justify-between gap-2" data-tour="matches-month">
        <h2 className="text-lg font-semibold capitalize">
          {format(selectedMonth, 'MMMM yyyy', { locale: fr })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setSelectedMonth(startOfMonth(new Date()))}
          >
            Mois actuel
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => setSelectedMonth((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => setSelectedMonth((d) => addMonths(d, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {monthMatches.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-sm">
          <CalendarX2 className="size-6 opacity-60" />
          Aucun match ce mois-ci.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {monthMatches.map((match) => {
            const category = getMatchCategory(match)
            return (
              <Link key={match.id} to={`/matches/${match.id}`}>
                <Card
                  className={cn(
                    'border-l-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                    MATCH_CATEGORY_BORDER[category],
                  )}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span>⚽ vs {match.opponent}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline">{MATCH_CATEGORY_LABELS[category]}</Badge>
                        <Badge variant={match.status === 'PLAYED' ? 'success' : 'outline'}>
                          {match.status === 'PLAYED' ? 'Joué' : 'À venir'}
                        </Badge>
                      </div>
                    </CardTitle>
                    <p className="text-muted-foreground text-sm capitalize">
                      {formatDate(match.date)} ·{' '}
                      {match.homeAway === 'HOME' ? 'Domicile' : 'Extérieur'}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {match.status === 'PLAYED' ? (
                      <p className="animate-pop-in text-2xl font-semibold">
                        {match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}
                      </p>
                    ) : (
                      <>
                        <p className="text-muted-foreground text-sm">
                          {match.venue ?? 'Lieu à définir'}
                        </p>
                        {(() => {
                          const attendance = attendanceByMatchId.get(match.id)
                          if (!attendance) return null
                          const presentCount = attendance.filter((a) => a.status === 'PRESENT').length
                          const guestTotal = attendance.reduce((sum, a) => sum + a.guestCount, 0)
                          if (presentCount === 0 && guestTotal === 0) return null
                          return (
                            <p className="text-muted-foreground text-xs">
                              {presentCount} joueur{presentCount > 1 ? 's' : ''}
                              {guestTotal > 0 && (
                                <>
                                  {' '}
                                  + {guestTotal} invité{guestTotal > 1 ? 's' : ''}
                                </>
                              )}
                              {' = '}
                              <strong className="text-foreground">
                                {presentCount + guestTotal} sur le terrain
                              </strong>
                            </p>
                          )
                        })()}
                      </>
                    )}
                    {(() => {
                      const motm = motmByMatchId.get(match.id)
                      if (!motm || motm.revealed || motm.totalPlayers === 0) return null
                      return (
                        <VoteProgress
                          totalVotes={motm.totalVotes}
                          totalPlayers={motm.totalPlayers}
                          votingClosesAt={motm.votingClosesAt}
                          barClassName={MATCH_CATEGORY_FILL[category]}
                          compact
                        />
                      )
                    })()}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
