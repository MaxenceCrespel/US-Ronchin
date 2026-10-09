import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { refreshSession } from '@/lib/api-client'
import { fetchMe } from './api'

const POLL_INTERVAL_MS = 5 * 60_000

/** Mounted once at the app root. The signed-in user is stored on the device at login and
 * the role travels inside the session token, so a role changed by an admin afterwards (a
 * player promoted to coach-joueur, a coach demoted) used to apply only after logging out
 * and back in. This re-reads the account when the app starts, comes back to the foreground
 * and every few minutes; when the role or the coach-joueur flag moved, the stored user is
 * updated and the session renewed straight away, so the server sees the new role too (the
 * refresh endpoint re-reads it from the database). */
export function SessionSync() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const queryClient = useQueryClient()

  const meQuery = useQuery({
    queryKey: ['session-me'],
    queryFn: fetchMe,
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const me = meQuery.data
  useEffect(() => {
    if (!me || !user || me.id !== user.id) return
    if (me.role === user.role && me.isPlayingCoach === user.isPlayingCoach) return
    setUser({ ...user, role: me.role, isPlayingCoach: me.isPlayingCoach })
    refreshSession()
      .then(() => queryClient.invalidateQueries())
      .catch(() => useAuthStore.getState().logout())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  return null
}
