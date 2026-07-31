import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Flame, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { fetchMonthlyChallenges } from './api'

export function MonthlyChallengesCard() {
  const query = useQuery({ queryKey: ['monthly-challenges'], queryFn: fetchMonthlyChallenges })
  const { topScorer, mostPresent } = query.data ?? {}

  if (!topScorer && !mostPresent) return null

  return (
    <Card className="border-club-gold/40 border-l-4" data-tour="stats-monthly-challenges">
      <CardHeader>
        <CardTitle className="text-base">Défis du mois</CardTitle>
        <CardDescription className="capitalize">{format(new Date(), 'MMMM yyyy', { locale: fr })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {topScorer && (
          <div className="bg-club-blue/5 flex items-center gap-3 rounded-xl p-3">
            <span className="bg-club-blue/10 text-club-blue flex size-9 shrink-0 items-center justify-center rounded-full">
              <Target className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Buteur du mois</p>
              <p className="text-sm font-semibold">
                {topScorer.firstName} {topScorer.lastName} — {topScorer.value} but
                {topScorer.value > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
        {mostPresent && (
          <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Flame className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Assidu du mois</p>
              <p className="text-sm font-semibold">
                {mostPresent.firstName} {mostPresent.lastName} — {mostPresent.value} présence
                {mostPresent.value > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
