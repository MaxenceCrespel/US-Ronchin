function seenKey(userId: string) {
  return `seen-awards-ceremony-${userId}`
}

/** One flag per (device, user) holding the last season whose ceremony was already played
 * — a season label is enough since only one season's votes can ever be closed-but-unseen
 * at a time. */
export function hasSeenCeremony(userId: string, season: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === season
  } catch {
    return false
  }
}

export function markCeremonySeen(userId: string, season: string) {
  try {
    localStorage.setItem(seenKey(userId), season)
  } catch {
    // localStorage unavailable — the ceremony just won't remember it's been shown, non-critical.
  }
}
