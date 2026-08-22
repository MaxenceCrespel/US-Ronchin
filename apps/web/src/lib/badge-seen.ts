function seenKey(userId: string) {
  return `seen-badges-${userId}`
}

/** True only if this device has never recorded a badge state for this user —
 * the one case where new badges shouldn't be celebrated (nothing to compare against). */
export function hasNeverSeenBadges(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === null
  } catch {
    return true
  }
}

/** Maps a badge key to the last count seen on this device — lets repeatable badges
 * (hat-trick, etc.) re-trigger the unlock celebration on each new occurrence, not just
 * the first. Legacy entries stored as a plain key array are treated as count 1 each. */
export function loadSeenBadges(userId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(seenKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as string[] | Record<string, number>
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((key) => [key, 1]))
    }
    return parsed
  } catch {
    return {}
  }
}

export function saveSeenBadges(userId: string, counts: Record<string, number>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(counts))
  } catch {
    // localStorage unavailable — badge unlock celebration just won't replay correctly, non-critical.
  }
}
