import { Trophy } from 'lucide-react'
import { StandingsCard } from './StandingsCard'
import { PoolMatchesCard } from './PoolMatchesCard'

/** Split out of "Stats" — the classement and the poule's own results are about the
 * competition itself, not about us or our own players, so they don't belong next to
 * individual/team stats. Our own results already live under "Matchs"; this page's job is
 * showing the rest of the poule alongside the table it produces. */
export function ChampionshipPage() {
  return (
    <div className="flex flex-col gap-6" data-tour="championship-page">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Trophy className="text-club-gold size-5" />
        Championnat
      </h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StandingsCard />
        <PoolMatchesCard />
      </div>
    </div>
  )
}
