import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { fetchMyPlayerRatings } from './ratings-api'

const POLL_INTERVAL_MS = 60_000

/** How many players the signed-in coach hasn't rated yet — shared by the sidebar badge, the
 * reminder modal/banner and the rating page itself, so they can never disagree. Coach/admin
 * only: a player never even calls this endpoint (PlayerRatingsController is coach-gated). */
export function usePendingPlayerRatings() {
  const user = useAuthStore((s) => s.user)
  const enabled = user?.role === 'COACH' || user?.role === 'SUPERADMIN'

  const query = useQuery({
    queryKey: ['player-ratings', 'mine'],
    queryFn: fetchMyPlayerRatings,
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const players = query.data ?? []
  const missing = useMemo(() => players.filter((p) => p.rating == null), [players])

  return { enabled, players, missing, total: players.length, isLoading: query.isLoading }
}
