import type { QueryClient } from '@tanstack/react-query'
import type { AttendanceStatus, User } from './types'

/** Optimistic update for a presence answer: the list the screen shows switches to the new
 * status immediately, is rolled back if the server refuses, and is refetched either way so the
 * server's view (cap, waitlist, teams) always wins in the end. */
export function optimisticAttendance<TItem extends { userId: string; status: AttendanceStatus | null }, TVars extends { status: AttendanceStatus }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  user: User | null,
  createFallback: (user: User) => TItem,
) {
  return {
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TItem[]>(queryKey)
      if (user && previous) {
        const exists = previous.some((a) => a.userId === user.id)
        const next = exists
          ? previous.map((a) => (a.userId === user.id ? { ...a, status: vars.status } : a))
          : [...previous, { ...createFallback(user), status: vars.status }]
        queryClient.setQueryData(queryKey, next)
      }
      return { previous }
    },
    onError: (_error: unknown, _vars: TVars, context: { previous: TItem[] | undefined } | undefined) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  }
}
