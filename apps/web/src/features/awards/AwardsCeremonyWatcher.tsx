import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { hasSeenCeremony, markCeremonySeen } from '@/lib/awards-ceremony-seen'
import { useCeremonyGateStore } from '@/lib/ceremony-gate'
import { fetchPlayerStats, fetchTeamStats } from '@/features/stats/api'
import { fetchPlayers } from '@/features/players/api'
import { AwardsCeremony } from './AwardsCeremony'
import { fetchAwardCategories } from './api'
import type { AwardCategory, PlayerStats, TeamStats } from '@/lib/types'

const POLL_INTERVAL_MS = 60_000

interface CeremonyData {
  season: string
  categories: AwardCategory[]
  teamStats: TeamStats
  roster: { firstName: string; lastName: string }[]
  myStats: PlayerStats | null
}

/** Mounted once at the app root, alongside BadgeUnlockWatcher and MandatoryVotePopup —
 * the instant this season's award categories are all closed (fixed date, or every roster
 * player having voted — see AwardsService.maybeCloseSeasonEarly) and this device hasn't
 * played the reveal yet, it takes over the screen once. Unlike the vote popup this isn't
 * roster-only: a non-playing coach didn't have to vote, but still gets to watch the
 * results. */
export function AwardsCeremonyWatcher() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)
  const eligible = !!user && !tourActive
  // localStorage isn't reactive on its own — this forces the unmount the instant onDone
  // fires, instead of waiting for some unrelated re-render to notice the flag changed.
  const [dismissed, setDismissed] = useState(false)

  // `?ceremony=replay` in the URL forces the ceremony to play again even on a device that
  // already saw it, and closing it doesn't re-mark it seen — a hook for reviewing the
  // ceremony's design without hunting through localStorage each time.
  const replay =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ceremony') === 'replay'

  const categoriesQuery = useQuery({
    queryKey: ['award-categories'],
    queryFn: fetchAwardCategories,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const categories = categoriesQuery.data ?? []
  const season = categories[0]?.season ?? null
  const allClosed = categories.length > 0 && categories.every((c) => !c.isActive)
  const unseen =
    eligible &&
    allClosed &&
    season != null &&
    !dismissed &&
    (replay || !hasSeenCeremony('season-awards', user!.id, season))

  const teamStatsQuery = useQuery({
    queryKey: ['stats', 'team', season],
    queryFn: () => fetchTeamStats(season!),
    enabled: unseen,
  })

  // Only used to fill the slot-machine reel with real names — not the source of truth for
  // anything else here, so it doesn't need to gate `unseen` the way teamStats does.
  const playersQuery = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
    enabled: unseen,
  })

  // Powers the personal "Rewind" segment — the full per-player list rather than a
  // dedicated "me" endpoint, since it's already exactly what /stats fetches and this stays
  // one request instead of two.
  const playerStatsQuery = useQuery({
    queryKey: ['stats', 'players', season],
    queryFn: () => fetchPlayerStats(season!),
    enabled: unseen,
  })

  // Snapshot the ceremony's data the first time everything is ready, and never update it
  // again from there — this same ['award-categories'] query key is also read by
  // MandatoryVotePopup, and its 60s poll / window-refocus refetch briefly clearing `data`
  // mid-fetch used to unmount AwardsCeremony and restart its curtain from scratch while the
  // player was mid-ceremony. Results are meant to be a fixed snapshot of the moment voting
  // closed anyway (see AwardsService.maybeCloseSeasonEarly), so freezing here is also just
  // correct, not merely a workaround.
  const [ceremony, setCeremony] = useState<CeremonyData | null>(null)
  useEffect(() => {
    if (!ceremony && unseen && teamStatsQuery.data && playersQuery.data && playerStatsQuery.data && season) {
      setCeremony({
        season,
        categories,
        teamStats: teamStatsQuery.data,
        roster: playersQuery.data
          .filter((p) => p.status === 'ACTIVE')
          .map((p) => ({ firstName: p.firstName, lastName: p.lastName })),
        myStats: playerStatsQuery.data.find((p) => p.userId === user!.id) ?? null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremony, unseen, teamStatsQuery.data, playersQuery.data, playerStatsQuery.data, season])

  // Only one full-screen ceremony overlay can ever be on screen — this always wins the gate
  // over the monthly ceremony (see ceremony-gate.ts), so releasing on unmount is the only
  // cleanup needed here.
  const claimGate = useCeremonyGateStore((s) => s.claim)
  const releaseGate = useCeremonyGateStore((s) => s.release)
  useEffect(() => {
    if (!ceremony) return
    claimGate('season')
    return () => releaseGate('season')
  }, [ceremony, claimGate, releaseGate])

  if (!ceremony) return null

  return (
    <AwardsCeremony
      season={ceremony.season}
      categories={ceremony.categories}
      teamStats={ceremony.teamStats}
      roster={ceremony.roster}
      myStats={ceremony.myStats}
      onDone={() => {
        if (!replay) markCeremonySeen('season-awards', user!.id, ceremony.season)
        setDismissed(true)
        setCeremony(null)
      }}
    />
  )
}
