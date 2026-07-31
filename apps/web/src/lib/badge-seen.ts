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

export function loadSeenBadges(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(userId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function saveSeenBadges(userId: string, keys: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...keys]))
  } catch {
    // localStorage unavailable — badge unlock celebration just won't replay correctly, non-critical.
  }
}
