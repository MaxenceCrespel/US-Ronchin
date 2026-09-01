import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Flame, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import type { MonthlyChallengeEntry } from '@/lib/types'
import { fetchMonthlyChallenges } from './api'

function joinNames(entries: MonthlyChallengeEntry[]): string {
  const names = entries.map((e) => `${e.firstName} ${e.lastName}`)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

export function MonthlyChallengesCard() {
  const query = useQuery({ queryKey: ['monthly-challenges'], queryFn: fetchMonthlyChallenges })
  const topScorers = query.data?.topScorers ?? []
  const mostPresentPlayers = query.data?.mostPresentPlayers ?? []

  if (topScorers.length === 0 && mostPresentPlayers.length === 0) return null

  return (
    <Card className="border-club-gold/40 border-l-4" data-tour="stats-monthly-challenges">
      <CardHeader>
        <CardDescription className="capitalize">{format(new Date(), 'MMMM yyyy', { locale: fr })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {topScorers.length > 0 && (
          <div className="bg-club-blue/5 flex items-center gap-3 rounded-xl p-3">
            <span className="bg-club-blue/10 text-club-blue flex size-9 shrink-0 items-center justify-center rounded-full">
              <Target className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Buteur du mois</p>
              <p className="text-sm font-semibold">
                {joinNames(topScorers)} — {topScorers[0].value} but
                {topScorers[0].value > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
        {mostPresentPlayers.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Flame className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Assidu du mois</p>
              <p className="text-sm font-semibold">
                {joinNames(mostPresentPlayers)} — {mostPresentPlayers[0].value} présence
                {mostPresentPlayers[0].value > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
