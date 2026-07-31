import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { PlayerStats } from '@/lib/types'

export function MyStatsCard({ stats }: { stats: PlayerStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Mes statistiques</span>
          {stats.presenceStreak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
              🔥 {stats.presenceStreak} entraînement{stats.presenceStreak > 1 ? 's' : ''} d'affilée
            </span>
          )}
        </CardTitle>
        <CardDescription>Récapitulatif de ta saison</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        {[
          ['Matchs joués', stats.matchesPlayed],
          ['Buts', stats.goals],
          ['Passes déc.', stats.assists],
          ['Homme du match', stats.motmCount],
          ['Cartons jaunes', stats.yellowCards],
          ['Cartons rouges', stats.redCards],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-club-blue/15 bg-accent/40 flex flex-col items-center rounded-lg border p-3"
          >
            <span className="text-club-blue-dark text-2xl font-bold">{value}</span>
            <span className="text-muted-foreground text-xs">{label}</span>
          </div>
        ))}
      </CardContent>
      {stats.trainingsResponded > 0 && (
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Taux de présence aux entraînements :{' '}
            <strong className="text-foreground">
              {Math.round((stats.trainingAttendanceRate ?? 0) * 100)}%
            </strong>{' '}
            ({stats.trainingsPresent}/{stats.trainingsResponded})
          </p>
        </CardContent>
      )}
    </Card>
  )
}
