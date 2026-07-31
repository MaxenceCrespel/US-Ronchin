import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Lock, LockOpen, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/lib/auth-store'
import type { AwardCategory } from '@/lib/types'
import { isRosterPlayer } from '@/lib/roster'
import { fetchPlayers } from '@/features/players/api'
import { castVote, fetchAwardCategories, setCategoryActive } from './api'

function CategoryCard({ category }: { category: AwardCategory }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isCoach = currentUser?.role === 'COACH'
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })
  const [selected, setSelected] = useState(category.myVoteUserId ?? '')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['award-categories'] })

  const voteMutation = useMutation({
    mutationFn: (votedForId: string) => castVote(category.id, votedForId),
    onSuccess: invalidate,
  })

  const toggleMutation = useMutation({
    mutationFn: () => setCategoryActive(category.id, !category.isActive),
    onSuccess: invalidate,
  })

  const players = playersQuery.data?.filter((p) => isRosterPlayer(p)) ?? []
  const winner = category.results?.[0]

  return (
    <Card className="border-club-gold/40 border-l-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Award className="text-club-gold size-4" />
            {category.title}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant={category.isActive ? 'outline' : 'secondary'}>
              {category.isActive ? 'Vote en cours' : 'Clôturé'}
            </Badge>
            {isCoach && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate()}
                aria-label={category.isActive ? 'Clôturer le vote' : 'Rouvrir le vote'}
              >
                {category.isActive ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
              </Button>
            )}
          </div>
        </CardTitle>
        {!category.isActive && (
          <CardDescription>{category.totalVotes} vote(s) exprimé(s)</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {category.isActive ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choisir un joueur" />
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selected || voteMutation.isPending}
              onClick={() => voteMutation.mutate(selected)}
            >
              {category.myVoteUserId ? 'Changer mon vote' : 'Voter'}
            </Button>
            {category.myVoteUserId && (
              <span className="text-muted-foreground text-xs">Tu as déjà voté — tu peux changer.</span>
            )}
          </div>
        ) : category.results && category.results.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {category.results.map((r, index) => (
              <li key={r.userId} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {index === 0 && <Trophy className="text-club-gold size-4" />}
                  {r.firstName} {r.lastName}
                </span>
                <Badge variant="secondary">{r.votes} vote(s)</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Aucun vote exprimé.</p>
        )}
        {winner && !category.isActive && (
          <p className="mt-3 text-sm font-medium">
            🏆 {winner.firstName} {winner.lastName}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function AwardsSection() {
  const categoriesQuery = useQuery({
    queryKey: ['award-categories'],
    queryFn: fetchAwardCategories,
  })

  const categories = categoriesQuery.data ?? []

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Trophées de fin de saison</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>
    </div>
  )
}
