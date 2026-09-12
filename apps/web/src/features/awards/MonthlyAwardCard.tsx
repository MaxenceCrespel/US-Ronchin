import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { monthLabelDisplay } from '@/lib/month-label'
import { fetchMonthlyAward } from './api'

/** "Joueur du mois" & co, à la LOSC — sits on the stats page next to the monthly challenges.
 * Read-only: the vote itself is definitive and only happens through MandatoryVotePopup (one
 * ballot, no changing your mind afterwards) — this used to also let you vote/re-vote here via
 * its own editable grid, a second surface for the exact same ballot that undermined "definitive".
 * While the month's vote is still open there's nothing to show yet, so the card stays hidden;
 * once closed, it shows last month's three winners and a link into the trophy case. */
export function MonthlyAwardCard() {
  const monthlyQuery = useQuery({ queryKey: ['award-monthly'], queryFn: fetchMonthlyAward })

  if (monthlyQuery.isLoading) return null

  const history = monthlyQuery.data?.history ?? []
  // The three categories always open and close together, so the most recent closed month's
  // categories are just every history row sharing that latest season value.
  const lastClosedSeason = history[0]?.season ?? null
  const lastClosedCategories = lastClosedSeason ? history.filter((c) => c.season === lastClosedSeason) : []

  if (lastClosedCategories.length === 0) return null

  const monthDisplay = lastClosedSeason ? monthLabelDisplay(lastClosedSeason) : ''

  return (
    <Card className="from-club-blue-dark overflow-hidden border-l-4 border-l-[#f4b400] bg-gradient-to-b to-black text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Trophy className="size-4 text-[#f4b400]" />
          Trophées du mois
        </CardTitle>
        <CardDescription className="text-white/60 capitalize">{monthDisplay}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {lastClosedCategories.map((category) => {
          const winner = category.results?.[0]
          if (!winner) return null
          return (
            <div key={category.id} className="flex items-center gap-3">
              <PlayerAvatar avatarUrl={null} firstName={winner.firstName} lastName={winner.lastName} size="md" />
              <div>
                <p className="text-xs text-white/50">{category.title}</p>
                <p className="font-semibold">
                  {winner.firstName} {winner.lastName}
                </p>
              </div>
            </div>
          )
        })}
        <Link to="/profile/trophies" className="mt-1 inline-block text-xs text-[#f4b400] underline">
          Voir ma vitrine de trophées
        </Link>
      </CardContent>
    </Card>
  )
}
