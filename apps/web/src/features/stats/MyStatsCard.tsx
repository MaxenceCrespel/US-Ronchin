import type { PlayerStats } from '@/lib/types'
import { cn } from '@/lib/utils'

export function MyStatsCard({ stats }: { stats: PlayerStats }) {
  const tiles: [label: string, value: number, highlight?: boolean][] = [
    ['Matchs joués', stats.matchesPlayed],
    ['Buts', stats.goals, true],
    ['Passes déc.', stats.assists],
    ['Homme du match', stats.motmCount],
    ['Patron de la défense', stats.patronDefenseCount],
    ['Cartons jaunes', stats.yellowCards],
    ['Cartons rouges', stats.redCards],
  ]
  const rate = Math.round((stats.trainingAttendanceRate ?? 0) * 100)

  return (
    <section className="bg-club-blue-dark flex flex-col gap-4 rounded-2xl p-4 text-white shadow-sm" aria-label="Ma saison">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold tracking-wide uppercase">Ma saison</h2>
        {stats.presenceStreak > 0 && (
          <span className="bg-club-gold text-club-blue-dark inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
            🔥 {stats.presenceStreak} entraînement{stats.presenceStreak > 1 ? 's' : ''} d'affilée
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([label, value, highlight]) => (
          <div key={label} className="flex flex-col gap-1 rounded-xl bg-white/10 p-3">
            <span
              className={cn(
                'font-display text-3xl leading-none font-extrabold tabular-nums',
                highlight && 'text-club-gold',
              )}
            >
              {value}
            </span>
            <span className="text-xs leading-tight text-white/80">{label}</span>
          </div>
        ))}
      </div>

      {stats.trainingsResponded > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--club-gold) 0 ${rate}%, rgb(255 255 255 / 0.2) ${rate}% 100%)` }}
            aria-hidden="true"
          >
            <span className="bg-club-blue-dark font-display flex size-9 items-center justify-center rounded-full text-sm font-extrabold">
              {rate}%
            </span>
          </div>
          <p className="text-sm">
            Présence aux entraînements : <strong>{rate}%</strong>
            <span className="text-white/75">
              {' '}
              ({stats.trainingsPresent}/{stats.trainingsResponded})
            </span>
          </p>
        </div>
      )}
    </section>
  )
}
