import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TeamLogo } from '@/components/TeamLogo'
import { cn } from '@/lib/utils'
import { fetchPoolMatches } from './api'
import type { PoolMatch } from '@/lib/types'

const ALL_TEAMS = 'ALL'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** "Journée 5" -> 5, so journées sort and navigate in the order they're actually played in —
 * not always the same as sorting by date (a postponed match can push one journée's own date
 * past the next one's). Anything that doesn't match (e.g. a fixture with no journée at all)
 * sorts last. */
function journeeNumber(label: string): number {
  const match = /\d+/.exec(label)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

/** A journée's "real" date — the one most of its matches share, not just the first one
 * alphabetically/chronologically. A single postponed fixture (ours, say) moves only that one
 * match's own date forward, which previously made "pick the first journée with an unplayed
 * match" get stuck on journée 1 indefinitely instead of moving on with the rest of the poule. */
function journeeDate(list: PoolMatch[]): string {
  const counts = new Map<string, number>()
  for (const m of list) counts.set(m.date, (counts.get(m.date) ?? 0) + 1)
  let best = list[0].date
  let bestCount = 0
  for (const [date, count] of counts) {
    if (count > bestCount) {
      best = date
      bestCount = count
    }
  }
  return best
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** `journeeLabel` only shows up in the "all matches of one team" view — grouped by journée
 * already, the label would just repeat the heading above each row. */
function MatchRow({ match, journeeLabel }: { match: PoolMatch; journeeLabel?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        match.isUs && 'bg-club-blue/5 font-semibold',
      )}
    >
      <span className="text-muted-foreground flex w-16 shrink-0 flex-col text-xs">
        <span className="tabular-nums">{formatDate(match.date)}</span>
        {journeeLabel && <span className="truncate">{journeeLabel}</span>}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 truncate">
        <span className="min-w-0 truncate">{match.homeTeam}</span>
        <TeamLogo src={match.homeLogo} />
      </span>
      <span className="shrink-0 tabular-nums">
        {match.played ? `${match.scoreHome} - ${match.scoreAway}` : 'à venir'}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
        <TeamLogo src={match.awayLogo} />
        <span className="min-w-0 truncate">{match.awayTeam}</span>
      </span>
    </div>
  )
}

/** Every match of the poule, ours included but not singled out to its own list — the whole
 * point is seeing how the rest of the group is actually doing, side by side with us, not
 * just our own results (already shown elsewhere on the calendar). One journée at a time,
 * navigated with arrows, rather than the whole season stacked — easier to actually read on a
 * phone, and the "current" journée (the most recent one whose date has already come) is
 * where it opens by default — see journeeDate's own comment for why that's date-based rather
 * than "first journée with an unplayed match". */
export function PoolMatchesCard() {
  const poolQuery = useQuery({ queryKey: ['pool-matches'], queryFn: fetchPoolMatches })
  const matches = poolQuery.data ?? []

  const [team, setTeam] = useState(ALL_TEAMS)
  const teamOptions = useMemo(
    () => [...new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam]))].sort((a, b) => a.localeCompare(b)),
    [matches],
  )
  const teamMatches = useMemo(
    () =>
      team === ALL_TEAMS
        ? []
        : matches
            .filter((m) => m.homeTeam === team || m.awayTeam === team)
            .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [matches, team],
  )

  const journees = useMemo(() => {
    const groups = new Map<string, PoolMatch[]>()
    for (const m of matches) {
      const key = m.matchday ?? 'Autres rencontres'
      const list = groups.get(key) ?? []
      list.push(m)
      groups.set(key, list)
    }
    return [...groups.entries()].sort((a, b) => {
      const diff = journeeNumber(a[0]) - journeeNumber(b[0])
      return diff !== 0 ? diff : a[1][0].date < b[1][0].date ? -1 : 1
    })
  }, [matches])

  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    if (journees.length === 0) {
      setIndex(null)
      return
    }
    // Default to whichever journée is "current" by a short window after it's played, not the
    // instant it's played — the weekend's results stay worth showing through the following
    // Wednesday, then it flips to the upcoming journée rather than lingering on last
    // weekend's. Not "the first unplayed match" either: a single postponed fixture would pin
    // that forever on an early journée even once the rest of the poule has moved on.
    setIndex((current) => {
      if (current !== null && current < journees.length) return current
      const today = new Date().toISOString().slice(0, 10)
      let lastPlayed = -1
      let lastPlayedDate = ''
      journees.forEach(([, list], i) => {
        const d = journeeDate(list)
        if (d <= today && d > lastPlayedDate) {
          lastPlayedDate = d
          lastPlayed = i
        }
      })
      if (lastPlayed === -1) return 0 // season hasn't started yet
      const stillCurrentUntil = addDays(lastPlayedDate, 3) // the Wednesday after a Sunday journée
      if (today <= stillCurrentUntil) return lastPlayed
      return lastPlayed + 1 < journees.length ? lastPlayed + 1 : lastPlayed
    })
  }, [journees])

  const current = index !== null ? journees[index] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="text-club-blue size-4" />
          Résultats de la poule
        </CardTitle>
        <CardDescription>Nos matchs et ceux des autres équipes, journée par journée — ou tous les matchs d'une équipe.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {matches.length === 0 ? (
          <p className="text-muted-foreground text-sm">Pas encore de résultats synchronisés.</p>
        ) : (
          <>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger aria-label="Filtrer par équipe" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEAMS}>Toutes les équipes</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {team !== ALL_TEAMS ? (
              teamMatches.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun match trouvé.</p>
              ) : (
                <div className="flex flex-col divide-y">
                  {teamMatches.map((m) => (
                    <MatchRow key={m.id} match={m} journeeLabel={m.matchday ?? undefined} />
                  ))}
                </div>
              )
            ) : !current ? (
              <p className="text-muted-foreground text-sm">Pas encore de résultats synchronisés.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => (i !== null ? Math.max(0, i - 1) : i))}
                    aria-label="Journée précédente"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <p className="min-w-0 truncate text-sm font-semibold">{current[0]}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={index === journees.length - 1}
                    onClick={() => setIndex((i) => (i !== null ? Math.min(journees.length - 1, i + 1) : i))}
                    aria-label="Journée suivante"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-col divide-y">
                  {current[1].map((m) => (
                    <MatchRow key={m.id} match={m} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
