import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarX2, ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, format, getISODay, isSameMonth, isToday, startOfMonth, subMonths } from 'date-fns'
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
  type MatchCategory,
  getMatchCategory,
  MATCH_CATEGORY_FILL,
  MATCH_CATEGORY_LABELS,
} from '@/lib/match-category'
import { createMatch, fetchMatchAttendance, fetchMatches, fetchMotm } from './api'
import { VoteProgress } from './VoteProgress'
import { MatchResultBadge } from '@/components/MatchResultBadge'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function MatchesPage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)
  const queryClient = useQueryClient()
  const matchesQuery = useQuery({ queryKey: ['matches'], queryFn: fetchMatches })

  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
  // `fetchMatches` returns rows in whatever order the DB/scraper happened to create or update
  // them in (e.g. a resync touches whichever matches FFF listed that day, not in date order) —
  // sorting here is what actually puts them on the calendar in the order they'll be played.
  const sortKey = (m: { date: string; kickOffTime: string | null }) => `${m.date}T${m.kickOffTime ?? '00:00'}`
  const monthMatches = useMemo(() => {
    return (matchesQuery.data ?? [])
      .filter((m) => isSameMonth(new Date(`${m.date}T00:00:00`), selectedMonth))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  }, [matchesQuery.data, selectedMonth])

  // Soonest-first for what's coming up; most-recent-first for what's already been played —
  // same convention as a real fixture list, and why these are sorted separately rather than
  // just splitting the single chronological `monthMatches` array in two.
  const playedMonthMatches = useMemo(
    () => monthMatches.filter((m) => m.status === 'PLAYED').slice().reverse(),
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

  // Filter by competition — only what's shown below; the data (and the vote/attendance
  // lookups above) stays the whole month.
  const [category, setCategory] = useState<MatchCategory | 'ALL'>('ALL')
  const inCategory = (m: (typeof monthMatches)[number]) => category === 'ALL' || getMatchCategory(m) === category
  const visibleUpcoming = upcomingMonthMatches.filter(inCategory)
  const visiblePlayed = playedMonthMatches.filter(inCategory)

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [kickOffTime, setKickOffTime] = useState('')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<MatchHomeAway>('HOME')
  const [venue, setVenue] = useState('')
  // A friendly match has nowhere for the scraper to source this from (it's only ever known
  // for an OFFICIAL_FFF match, scraped from FFF's own match-detail page) — a manual field here
  // is the only way it ever gets set for one.
  const [surface, setSurface] = useState<string>('unspecified')

  const createMutation = useMutation({
    mutationFn: () =>
      createMatch({
        date,
        kickOffTime: kickOffTime || undefined,
        opponent,
        homeAway,
        venue: venue || undefined,
        surface: surface === 'unspecified' ? undefined : surface,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      setOpen(false)
      setOpponent('')
      setVenue('')
      setKickOffTime('')
      setSurface('unspecified')
    },
  })

  function renderMatchCard(match: (typeof monthMatches)[number]) {
    const matchCategory = getMatchCategory(match)
    return (
      <Link key={match.id} to={`/matches/${match.id}`}>
        <Card className="relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
          <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', MATCH_CATEGORY_FILL[matchCategory])} />
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span className="min-w-0 truncate">vs {match.opponent}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">{MATCH_CATEGORY_LABELS[matchCategory]}</Badge>
                <Badge variant={match.status === 'PLAYED' ? 'success' : 'outline'}>
                  {match.status === 'PLAYED' ? 'Joué' : 'À venir'}
                </Badge>
              </div>
            </CardTitle>
            <p className="text-muted-foreground text-sm capitalize">
              {formatDate(match.date)}
              {match.kickOffTime && ` · ${match.kickOffTime.slice(0, 5)}`} ·{' '}
              {match.homeAway === 'HOME' ? 'Domicile' : 'Extérieur'}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {match.status === 'PLAYED' ? (
              <p className="animate-pop-in font-display flex items-center gap-2 text-4xl font-extrabold">
                {match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}
                <MatchResultBadge match={match} />
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">{match.venue ?? 'Lieu à définir'}</p>
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
                  barClassName={MATCH_CATEGORY_FILL[matchCategory]}
                  compact
                />
              )
            })()}
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl leading-tight font-extrabold uppercase">Matchs</h1>
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
                  <Label htmlFor="kickOffTime">Heure (optionnel)</Label>
                  <Input
                    id="kickOffTime"
                    type="time"
                    value={kickOffTime}
                    onChange={(e) => setKickOffTime(e.target.value)}
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
                    <SelectTrigger aria-label="Domicile ou extérieur" className="w-full">
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
                <div className="flex flex-col gap-1.5">
                  <Label>Type de pelouse (optionnel)</Label>
                  <Select value={surface} onValueChange={setSurface}>
                    <SelectTrigger aria-label="Type de pelouse" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Non précisé</SelectItem>
                      <SelectItem value="Pelouse Naturelle">Naturelle</SelectItem>
                      <SelectItem value="Synthétique">Synthétique</SelectItem>
                    </SelectContent>
                  </Select>
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

      <div className="flex flex-wrap items-center justify-between gap-2" data-tour="matches-month">
        <h2 className="font-display text-2xl font-bold capitalize">
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
            aria-label="Mois précédent"
            onClick={() => setSelectedMonth((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Mois suivant"
            onClick={() => setSelectedMonth((d) => addMonths(d, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div role="group" aria-label="Filtrer par compétition" className="flex flex-wrap gap-2">
        {(['ALL', 'LEAGUE', 'CUP', 'FRIENDLY'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
              category === c ? 'bg-club-blue-dark border-club-blue-dark text-white' : 'bg-card hover:bg-accent',
            )}
          >
            {c !== 'ALL' && <span aria-hidden="true" className={cn('size-2.5 rounded-full', MATCH_CATEGORY_FILL[c])} />}
            {c === 'ALL' ? 'Tous' : MATCH_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="px-4">
          <div className="grid grid-cols-7 gap-1 text-center">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
              <span key={i} className="text-muted-foreground pb-1 text-xs font-bold">
                {d}
              </span>
            ))}
            {Array.from({ length: getISODay(selectedMonth) - 1 }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {eachDayOfInterval({ start: selectedMonth, end: endOfMonth(selectedMonth) }).map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayMatches = monthMatches.filter((m) => m.date === key && inCategory(m))
              const first = dayMatches[0]
              const body = (
                <>
                  <span>{format(day, 'd')}</span>
                  <span className="flex h-1.5 gap-0.5">
                    {dayMatches.map((m) => (
                      <span key={m.id} className={cn('size-1.5 rounded-full', MATCH_CATEGORY_FILL[getMatchCategory(m)])} />
                    ))}
                  </span>
                </>
              )
              const cls = cn(
                'flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm',
                isToday(day) ? 'bg-club-blue-dark font-bold text-white' : first ? 'bg-muted font-bold' : '',
              )
              return first ? (
                <Link
                  key={key}
                  to={`/matches/${first.id}`}
                  className={cn(cls, 'hover:bg-accent')}
                  aria-label={`${format(day, 'EEEE d MMMM', { locale: fr })} : ${dayMatches.map((m) => `vs ${m.opponent}`).join(', ')}`}
                >
                  {body}
                </Link>
              ) : (
                <span key={key} className={cls}>
                  {body}
                </span>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {monthMatches.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-sm">
          <CalendarX2 className="size-6 opacity-60" />
          Aucun match ce mois-ci.
        </div>
      ) : (
        <>
          {visibleUpcoming.length === 0 && visiblePlayed.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">Aucun match de ce type ce mois-ci.</p>
          )}
          {visibleUpcoming.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold tracking-wide uppercase">
                À venir
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleUpcoming.map((match) => renderMatchCard(match))}
              </div>
            </div>
          )}
          {visiblePlayed.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold tracking-wide uppercase">
                Joués
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visiblePlayed.map((match) => renderMatchCard(match))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
