function seenKey(userId: string) {
  return `seen-trophy-feature-intro-${userId}`
}

/** Opposite polarity from the other "seen" trackers in this codebase (badge-seen.ts,
 * match-trophy-seen.ts, monthly-trophy-seen.ts): those default to "already seen" on a blank
 * localStorage so a brand-new device doesn't get flooded with every past win the instant the
 * feature ships. Here the whole point is the reverse — announce the trophy vitrine to every
 * *existing* player exactly once, so a blank localStorage means "hasn't seen it yet". */
export function hasSeenTrophyFeatureIntro(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    return true
  }
}

export function markTrophyFeatureIntroSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), '1')
  } catch {
    // localStorage unavailable — the announcement just might replay once more, non-critical.
  }
}
