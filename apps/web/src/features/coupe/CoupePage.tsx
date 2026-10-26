import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
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

/** Links straight to the match's own fiche when it's one of ours — see
 * StandingsService.findAllPoolMatches's doc comment (CupMatch.matchId is resolved the same
 * way) for why a cup match between two other clubs never gets one. */
function CupMatchCard({ match }: { match: CupMatch }) {
  const homeWon = match.played && match.scoreHome !== null && match.scoreAway !== null && match.scoreHome > match.scoreAway
  const awayWon = match.played && match.scoreHome !== null && match.scoreAway !== null && match.scoreAway > match.scoreHome
  const cardClassName = cn(
    'flex w-48 shrink-0 flex-col gap-1 rounded-lg border p-2 text-xs',
    match.isUs && 'border-club-blue bg-club-blue/5',
    match.matchId && 'hover:bg-club-blue/10',
  )
  const content = (
    <>
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
    </>
  )
  if (match.matchId) {
    return (
      <Link to={`/matches/${match.matchId}`} className={cardClassName}>
        {content}
      </Link>
    )
  }
  return <div className={cardClassName}>{content}</div>
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

/** Our own run, one round per step — the story a player actually wants ("are we still in?"),
 * shown above the full pool table. Which side is us comes from the team name: the sync flags
 * the match (isUs) but not the side, and every club name on the district site carries its
 * town. A draw on the sheet (decided on penalties) stays neutral rather than guessing. */
function OurPath({ matches }: { matches: CupMatch[] }) {
  if (matches.length === 0) return null
  return (
    <section className="flex flex-col gap-3" aria-label="Notre parcours">
      <h2 className="font-display text-xl font-bold tracking-wide uppercase">Notre parcours</h2>
      <ol className="flex flex-col">
        {matches.map((m, i) => {
          const homeIsUs = /ronchin/i.test(m.homeTeam)
          const opponent = homeIsUs ? m.awayTeam : m.homeTeam
          const ours = homeIsUs ? m.scoreHome : m.scoreAway
          const theirs = homeIsUs ? m.scoreAway : m.scoreHome
          const outcome = !m.played || ours == null || theirs == null ? 'next' : ours > theirs ? 'won' : ours < theirs ? 'lost' : 'draw'
          const last = i === matches.length - 1
          const card = (
            <div
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3',
                outcome === 'next' ? 'bg-club-blue-dark border-club-blue-dark text-white' : 'bg-card',
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">
                  {homeIsUs ? `Ronchin – ${opponent}` : `${opponent} – Ronchin`}
                </span>
                <span className={cn('text-xs', outcome === 'next' ? 'text-white/80' : 'text-muted-foreground')}>
                  {formatDate(m.date)} · {homeIsUs ? 'Domicile' : 'Extérieur'}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1',
                  outcome === 'next'
                    ? 'bg-club-gold text-club-blue-dark text-xs font-bold'
                    : cn(
                        'font-display text-lg font-extrabold text-white',
                        outcome === 'won' ? 'bg-result-win' : outcome === 'lost' ? 'bg-result-loss' : 'bg-slate-500',
                      ),
                )}
              >
                {outcome === 'next' ? 'À venir' : `${m.scoreHome} – ${m.scoreAway}`}
              </span>
            </div>
          )
          return (
            <li key={m.id} className="flex gap-3">
              <div className="flex w-5 flex-col items-center" aria-hidden="true">
                <span
                  className={cn(
                    'mt-5 size-4 shrink-0 rounded-full',
                    outcome === 'next'
                      ? 'bg-club-gold ring-club-gold/30 ring-4'
                      : outcome === 'lost'
                        ? 'bg-result-loss'
                        : 'bg-club-blue',
                  )}
                />
                {!last && <span className="bg-club-blue/40 mt-1 w-0.5 flex-1" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-4">
                <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">{m.round}</span>
                {m.matchId ? (
                  <Link to={`/matches/${m.matchId}`} className="transition-transform hover:-translate-y-0.5">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
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

  const ourMatches = rounds.flatMap((r) => r.matches.filter((m) => m.isUs))

  const lastRound = rounds.at(-1)
  // A single match in the last known round is the final — nothing more to draw, so no
  // placeholder after it. Otherwise the next round still has to be drawn from whoever wins.
  const nextRoundSlots = lastRound && lastRound.matches.length > 1 ? Math.ceil(lastRound.matches.length / 2) : 0

  return (
    <div className="flex flex-col gap-6" data-tour="coupe-page">
      <h1 className="flex items-center gap-2 font-display text-3xl leading-tight font-extrabold uppercase">
        <Swords className="text-club-gold size-5" />
        Coupe
      </h1>
      <OurPath matches={ourMatches} />
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
