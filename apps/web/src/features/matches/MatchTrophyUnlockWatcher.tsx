import { useEffect, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { useCeremonyGateStore } from '@/lib/ceremony-gate'
import { hasNeverSeenMatchTrophies, loadSeenMatchTrophyIds, saveSeenMatchTrophyIds } from '@/lib/match-trophy-seen'
import type { MatchTrophyWinners } from '@/lib/types'
import { fetchComposition, fetchRecentMatchTrophyWinners } from './api'
import { MatchTrophyReveal, type MatchTrophyRevealItem } from './MatchTrophyReveal'

const POLL_INTERVAL_MS = 60_000

function formatMatchDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Ties beyond two names would turn one line into a paragraph — past that, name the first
 * and count the rest instead of listing everyone. */
function namesLine(names: string[]): string {
  if (names.length <= 2) return names.join(' et ')
  return `${names[0]} et ${names.length - 1} autres`
}

const LABELS = { motm: 'Homme du match', defense_boss: 'Patron de la défense' } as const

function buildItems(match: MatchTrophyWinners, viewerId: string, viewerFirstName: string): MatchTrophyRevealItem[] {
  const usName = 'US Ronchin'
  const scoreLine =
    match.homeAway === 'HOME'
      ? `${usName} ${match.scoreHome ?? '-'} - ${match.scoreAway ?? '-'} ${match.opponent}`
      : `${match.opponent} ${match.scoreHome ?? '-'} - ${match.scoreAway ?? '-'} ${usName}`
  const dateLine = `${scoreLine} · ${formatMatchDate(match.date)}`

  const kinds: { kind: 'motm' | 'defense_boss'; winners: MatchTrophyWinners['motmWinners'] }[] = [
    { kind: 'motm', winners: match.motmWinners },
    { kind: 'defense_boss', winners: match.defenseBossWinners },
  ]
  return kinds
    .filter((k): k is { kind: 'motm' | 'defense_boss'; winners: NonNullable<typeof k.winners> } => !!k.winners && k.winners.length > 0)
    .map(({ kind, winners }) => {
      const isViewerWinner = winners.some((w) => w.userId === viewerId)
      const headline = isViewerWinner
        ? `Félicitations ${viewerFirstName} !`
        : `Félicitations ${namesLine(winners.map((w) => `${w.firstName} ${w.lastName}`))} !`
      return {
        id: `${match.matchId}:${kind}`,
        kind,
        headline,
        subtitle: `${LABELS[kind]} — ${dateLine}`,
        showBetterLuckNote: !isViewerWinner,
      }
    })
}

/** Mounted once at the app root, alongside MonthlyTrophyUnlockWatcher — the moment a match's
 * "Homme du match"/"Patron de la défense" vote reveals (see motm-utils.ts's isMotmRevealed),
 * it takes over the screen once for every player who was actually part of that match's
 * composition (not just the winner, and not for a player who didn't play it at all — same
 * eligibility as the vote itself), the next time each of them is actually using the app. */
export function MatchTrophyUnlockWatcher() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)
  const [queue, setQueue] = useState<MatchTrophyRevealItem[]>([])

  const eligible = !!user && !tourActive
  const matchesQuery = useQuery({
    queryKey: ['recent-match-trophy-winners'],
    queryFn: fetchRecentMatchTrophyWinners,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const revealedMatches = (matchesQuery.data ?? []).filter((m) => m.motmWinners || m.defenseBossWinners)

  // One composition fetch per recent, revealed match — small, fixed-size list (the backend
  // caps it at 3), just to check "was the viewer actually part of this one".
  const compositionQueries = useQueries({
    queries: revealedMatches.map((m) => ({
      queryKey: ['match-composition', m.matchId],
      queryFn: () => fetchComposition(m.matchId),
      enabled: eligible,
      staleTime: POLL_INTERVAL_MS,
    })),
  })
  const compositionsReady = compositionQueries.every((q) => q.isSuccess)

  useEffect(() => {
    if (!user || !eligible || !compositionsReady) return

    const allItems = revealedMatches.flatMap((match, i) => {
      const composition = compositionQueries[i].data ?? []
      const wasPlaying = composition.some((c) => c.userId === user.id)
      if (!wasPlaying) return []
      return buildItems(match, user.id, user.firstName)
    })

    // Only skip the diff when this device has never recorded a match-trophy state for this
    // user — every other load (including page reloads) compares against the persisted "seen"
    // set, or a newly-revealed result gets silently swallowed on the next refresh instead of
    // being shown. `item.id` is already the exact "${matchId}:${kind}" composite
    // matchTrophyId builds from a match/kind pair — MatchTrophyRevealItem doesn't carry a
    // separate matchId field, so this reads the id directly rather than reconstructing it.
    if (hasNeverSeenMatchTrophies(user.id)) {
      saveSeenMatchTrophyIds(user.id, new Set(allItems.map((t) => t.id)))
      return
    }

    const seen = loadSeenMatchTrophyIds(user.id)
    const unseen = allItems.filter((t) => !seen.has(t.id))
    if (unseen.length > 0) {
      saveSeenMatchTrophyIds(user.id, new Set(allItems.map((t) => t.id)))
      setQueue((prev) => [...prev, ...unseen])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionsReady, user, eligible])

  // Season and monthly ceremonies both outrank a match trophy, but a match trophy can
  // preempt the feature-intro tour — see ceremony-gate.ts. Only actually render once this
  // watcher successfully holds the gate; `gateActive` is watched so a claim is retried the
  // moment the gate frees up (or something lower-priority is showing), but never
  // released-then-reclaimed on every render once already held (that would toggle back and
  // forth forever).
  const gateActive = useCeremonyGateStore((s) => s.active)
  const claimGate = useCeremonyGateStore((s) => s.claim)
  const releaseGate = useCeremonyGateStore((s) => s.release)
  const hasQueue = queue.length > 0
  const [holdsGate, setHoldsGate] = useState(false)
  useEffect(() => {
    if (!hasQueue) return
    if (holdsGate) {
      if (gateActive !== 'match') setHoldsGate(false)
      return
    }
    if (gateActive === 'season' || gateActive === 'monthly') return
    if (claimGate('match')) setHoldsGate(true)
  }, [hasQueue, gateActive, holdsGate, claimGate])

  useEffect(() => {
    if (!hasQueue && holdsGate) {
      releaseGate('match')
      setHoldsGate(false)
    }
  }, [hasQueue, holdsGate, releaseGate])
  useEffect(() => {
    return () => releaseGate('match')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hasQueue || !holdsGate) return null

  return (
    <MatchTrophyReveal
      queue={queue}
      onDone={() => {
        setQueue([])
        releaseGate('match')
        setHoldsGate(false)
      }}
    />
  )
}
