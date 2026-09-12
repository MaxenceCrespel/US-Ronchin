function seenKey(kind: string, userId: string) {
  return `seen-${kind}-ceremony-${userId}`
}

/** One flag per (device, user, kind) holding the last period whose ceremony was already
 * played — a season label ("2026-2027") for the end-of-season ceremony, a month label
 * ("2026-09") for the monthly one. A period label is enough since only one period's votes
 * can ever be closed-but-unseen at a time per kind. */
export function hasSeenCeremony(kind: string, userId: string, period: string): boolean {
  try {
    return localStorage.getItem(seenKey(kind, userId)) === period
  } catch {
    return false
  }
}

export function markCeremonySeen(kind: string, userId: string, period: string) {
  try {
    localStorage.setItem(seenKey(kind, userId), period)
  } catch {
    // localStorage unavailable — the ceremony just won't remember it's been shown, non-critical.
  }
}
