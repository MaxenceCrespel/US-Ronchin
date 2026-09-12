import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useAuthStore } from '@/lib/auth-store'
import { isRosterPlayer } from '@/lib/roster'
import { monthLabelDisplay } from '@/lib/month-label'
import { fetchPlayers } from '@/features/players/api'
import type { AwardCategory } from '@/lib/types'
import { PlayerVoteGrid, type VotablePlayer } from './PlayerVoteGrid'
import { castVote, fetchMonthlyAward } from './api'

/** One category's ballot within the card — its own selection state and its own vote
 * mutation. Only "Joueur du mois" lives here today; "Homme du match" and "Patron de la
 * défense" are voted per match instead (see matches.service.ts), not monthly. */
function MonthlyCategoryVote({ category, players }: { category: AwardCategory; players: VotablePlayer[] }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const voteMutation = useMutation({
    mutationFn: (votedForId: string) => castVote(category.id, votedForId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['award-monthly'] }),
  })
  const effectiveSelection = selected ?? category.myVoteUserId ?? null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[#f4b400]">{category.title}</p>
      <PlayerVoteGrid players={players} selectedId={effectiveSelection} onSelect={setSelected} />
      <Button
        size="sm"
        className="self-start bg-[#f4b400] text-black hover:bg-[#f4b400]/90"
        disabled={!effectiveSelection || voteMutation.isPending}
        onClick={() => voteMutation.mutate(effectiveSelection!)}
      >
        {category.myVoteUserId ? 'Changer mon vote' : 'Voter'}
      </Button>
    </div>
  )
}

/** "Joueur du mois" & co, à la LOSC — sits on the stats page next to the monthly challenges.
 * While the month's votes are open, it's the ballot itself for all three categories (tap-to-
 * pick, same grid as the season awards, one ballot per category); once closed, it shows last
 * month's three winners and a link into the trophy case. Open to the whole roster, same
 * electorate as the season awards. */
export function MonthlyAwardCard() {
  const currentUser = useAuthStore((s) => s.user)
  const monthlyQuery = useQuery({ queryKey: ['award-monthly'], queryFn: fetchMonthlyAward })
  const currentCategories = monthlyQuery.data?.current ?? []
  const playersQuery = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
    enabled: currentCategories.length > 0,
  })

  if (monthlyQuery.isLoading) return null

  const history = monthlyQuery.data?.history ?? []
  // The three categories always open and close together, so the most recent closed month's
  // categories are just every history row sharing that latest season value.
  const lastClosedSeason = history[0]?.season ?? null
  const lastClosedCategories = lastClosedSeason ? history.filter((c) => c.season === lastClosedSeason) : []

  if (currentCategories.length === 0 && lastClosedCategories.length === 0) return null

  const players = (playersQuery.data ?? []).filter((p) => isRosterPlayer(p) && p.id !== currentUser?.id)
  const monthDisplay = currentCategories[0]?.season
    ? monthLabelDisplay(currentCategories[0].season!)
    : lastClosedSeason
      ? monthLabelDisplay(lastClosedSeason)
      : ''

  return (
    <Card className="from-club-blue-dark overflow-hidden border-l-4 border-l-[#f4b400] bg-gradient-to-b to-black text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Trophy className="size-4 text-[#f4b400]" />
          Trophées du mois
        </CardTitle>
        <CardDescription className="text-white/60 capitalize">
          {currentCategories.length > 0 ? `Vote en cours — ${monthDisplay}` : monthDisplay}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {currentCategories.length > 0
          ? currentCategories.map((category) => (
              <MonthlyCategoryVote key={category.id} category={category} players={players} />
            ))
          : lastClosedCategories.map((category) => {
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
