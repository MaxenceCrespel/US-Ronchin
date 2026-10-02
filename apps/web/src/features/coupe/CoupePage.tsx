import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Swords, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TeamLogo } from '@/components/TeamLogo'
import { cn } from '@/lib/utils'
import { fetchCupMatches } from '@/features/standings/api'
import type { CupMatch } from '@/lib/types'

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function CupMatchCard({ match }: { match: CupMatch }) {
  const homeWon = match.played && match.scoreHome !== null && match.scoreAway !== null && match.scoreHome > match.scoreAway
  const awayWon = match.played && match.scoreHome !== null && match.scoreAway !== null && match.scoreAway > match.scoreHome

  return (
    <div
      className={cn(
        'flex w-48 shrink-0 flex-col gap-1 rounded-lg border p-2 text-xs',
        match.isUs && 'border-club-blue bg-club-blue/5',
      )}
    >
      <p className="text-muted-foreground">{formatDate(match.date)}</p>
      <div className={cn('flex items-center justify-between gap-2', homeWon && 'font-semibold')}>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <TeamLogo src={match.homeLogo} />
          <span className="min-w-0 truncate">{match.homeTeam}</span>
        </span>
        <span className="shrink-0 tabular-nums">{match.played ? match.scoreHome : ''}</span>
      </div>
      <div className={cn('flex items-center justify-between gap-2', awayWon && 'font-semibold')}>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <TeamLogo src={match.awayLogo} />
          <span className="min-w-0 truncate">{match.awayTeam}</span>
        </span>
        <span className="shrink-0 tabular-nums">{match.played ? match.scoreAway : ''}</span>
      </div>
      {!match.played && <p className="text-muted-foreground">À venir</p>}
    </div>
  )
}

function PlaceholderCard() {
  return (
    <div className="flex w-48 shrink-0 flex-col gap-1 rounded-lg border border-dashed p-2 text-xs">
      <p className="text-muted-foreground">À déterminer</p>
    </div>
  )
}

function RoundColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-3">
      <p className="text-muted-foreground text-center text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

/** Not a fixed knockout tree — this district's cup redraws pairings from scratch each round
 * (confirmed by the coach: round 2's pairs aren't round 1's neighbouring winners), so there's
 * no real bracket-slot relationship to wire a connector line to. One column per round instead,
 * everyone's matches (not just ours — ours is just highlighted), oldest round first, with a
 * placeholder column for the round that hasn't been drawn/synced yet — "on adapte le tableau à
 * chaque tour" : a new round only gets its own real column once it's actually been scraped. */
export function CoupePage() {
  const cupQuery = useQuery({ queryKey: ['cup-matches'], queryFn: fetchCupMatches })

  const rounds = useMemo(() => {
    const matches = cupQuery.data ?? []
    const groups = new Map<string, CupMatch[]>()
    for (const m of matches) {
      const list = groups.get(m.round) ?? []
      list.push(m)
      groups.set(m.round, list)
    }
    return [...groups.entries()]
      .map(([round, list]) => ({
        round,
        matches: [...list].sort((a, b) => (a.date < b.date ? -1 : 1)),
        minDate: list.reduce((min, m) => (m.date < min ? m.date : min), list[0].date),
      }))
      .sort((a, b) => (a.minDate < b.minDate ? -1 : 1))
  }, [cupQuery.data])

  const lastRound = rounds.at(-1)
  // A single match in the last known round is the final — nothing more to draw, so no
  // placeholder after it. Otherwise the next round still has to be drawn from whoever wins.
  const nextRoundSlots = lastRound && lastRound.matches.length > 1 ? Math.ceil(lastRound.matches.length / 2) : 0

  return (
    <div className="flex flex-col gap-6" data-tour="coupe-page">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Swords className="text-club-gold size-5" />
        Coupe
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tableau de la coupe</CardTitle>
          <CardDescription>
            Tous les matchs de la poule, tour par tour — le tableau se complète au fil des tirages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rounds.length === 0 ? (
            <p className="text-muted-foreground text-sm">Pas encore de match de coupe synchronisé.</p>
          ) : (
            <div className="flex items-start gap-4 overflow-x-auto pb-2">
              {rounds.map((r, idx) => (
                <div key={r.round} className="flex items-start gap-4">
                  <RoundColumn label={r.round}>
                    {r.matches.map((m) => (
                      <CupMatchCard key={m.id} match={m} />
                    ))}
                  </RoundColumn>
                  {(idx < rounds.length - 1 || nextRoundSlots > 0) && (
                    <ChevronRight className="text-muted-foreground mt-8 size-5 shrink-0" />
                  )}
                </div>
              ))}
              {nextRoundSlots > 0 && (
                <RoundColumn label="Tour suivant">
                  {Array.from({ length: nextRoundSlots }).map((_, i) => (
                    <PlaceholderCard key={i} />
                  ))}
                </RoundColumn>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
