import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { isRosterPlayer } from '@/lib/roster'
import { monthLabelDisplay } from '@/lib/month-label'
import type { AwardCategory } from '@/lib/types'
import { fetchAwardCategories, fetchMonthlyAward } from './api'

const POLL_INTERVAL_MS = 60_000

export type PendingVoteSource = 'season' | 'monthly'

/** Whichever of the season or monthly awards vote (if either) still has an unvoted category
 * for the current player — shared by MandatoryVotePopup (the guided vote flow itself) and
 * VoteReminderBanner (the non-dismissible nudge shown once that popup's been closed without
 * voting), so the two can never disagree about what's actually still pending. Season always
 * wins if both happen to be open and unvoted at once — the rarer, bigger event, same
 * convention as ceremony-gate.ts's reveal priority. */
export function usePendingVote() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)

  // A non-playing coach/admin isn't part of the roster and isn't forced to vote — same rule
  // for both sources.
  const eligible = !!user && isRosterPlayer(user) && !tourActive

  const seasonQuery = useQuery({
    queryKey: ['award-categories'],
    queryFn: fetchAwardCategories,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const monthlyQuery = useQuery({
    queryKey: ['award-monthly'],
    queryFn: fetchMonthlyAward,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const seasonPending = useMemo(
    () => (seasonQuery.data ?? []).filter((c) => c.isActive && !c.myVoteUserId),
    [seasonQuery.data],
  )
  const monthlyPending = useMemo(
    () => (monthlyQuery.data?.current ?? []).filter((c) => c.isActive && !c.myVoteUserId),
    [monthlyQuery.data],
  )

  const source: PendingVoteSource | null =
    seasonPending.length > 0 ? 'season' : monthlyPending.length > 0 ? 'monthly' : null
  const pending: AwardCategory[] = source === 'season' ? seasonPending : source === 'monthly' ? monthlyPending : []

  const periodLabel =
    source === 'season'
      ? (pending[0]?.season ?? null)
      : source === 'monthly' && pending[0]?.season
        ? monthLabelDisplay(pending[0].season)
        : null

  return { eligible, source, pending, periodLabel }
}
