import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { hasNeverSeenBadges, loadSeenBadges, saveSeenBadges } from '@/lib/badge-seen'
import { BadgePackReveal } from '@/components/BadgePackReveal'
import type { BadgeStatus } from '@/lib/types'
import { fetchMyBadges } from '@/features/badges/api'

const POLL_INTERVAL_MS = 60_000

/** Mounted once at the app root — surfaces newly-earned badges as a pack-opening
 * reveal no matter which page the player is on, not just when they open the Badges tab. */
export function BadgeUnlockWatcher() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)
  const [queue, setQueue] = useState<BadgeStatus[]>([])
  const queuedRef = useRef<Record<string, number>>({})

  const badgesQuery = useQuery({
    queryKey: ['badges', user?.id],
    queryFn: fetchMyBadges,
    enabled: !!user && !tourActive,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    // The query cache may briefly hold the tour's demo badges (same key) — never diff
    // or celebrate against those, and never record them as "seen".
    if (!user || !badgesQuery.data || tourActive) return
    const earned = badgesQuery.data.filter((b) => b.earned)

    // Only skip the diff when this device has literally never recorded a badge
    // state for this user — every other load (including page reloads) must
    // compare against the persisted "seen" set, or newly-earned badges get
    // silently swallowed on the next refresh instead of being celebrated.
    if (hasNeverSeenBadges(user.id)) {
      saveSeenBadges(user.id, Object.fromEntries(earned.map((b) => [b.key, b.count])))
      return
    }

    // "Seen" is only recorded once the reveal has actually been played through (see
    // handleDone) — recording it here, at detection time, meant a reveal that couldn't be
    // tapped (or an app closed mid-reveal) still marked the badge as celebrated, so it
    // never replayed. queuedRef keeps the 60s poll from re-queuing what's already waiting.
    const seen = loadSeenBadges(user.id)
    const newlyEarned = earned.filter(
      (b) => b.count > Math.max(seen[b.key] ?? 0, queuedRef.current[b.key] ?? 0),
    )
    if (newlyEarned.length > 0) {
      for (const b of newlyEarned) queuedRef.current[b.key] = b.count
      setQueue((prev) => [...prev, ...newlyEarned])
    }
  }, [badgesQuery.data, user, tourActive])

  if (queue.length === 0) return null

  const handleDone = () => {
    if (user) {
      saveSeenBadges(user.id, {
        ...loadSeenBadges(user.id),
        ...Object.fromEntries(queue.map((b) => [b.key, b.count])),
      })
    }
    queuedRef.current = {}
    setQueue([])
  }

  return <BadgePackReveal queue={queue} onDone={handleDone} />
}
