function seenKey(userId: string) {
  return `seen-monthly-trophies-${userId}`
}

/** A monthly trophy isn't one recurring "period" the way the old whole-roster ceremony
 * treated it — a player can win several different monthly categories ("Joueur du mois",
 * "Assidu du mois", "Vainqueur d'entraînement") in the same month, or the same category
 * again next month, so this tracks a whole set of already-celebrated
 * `${categoryKey}:${month}` ids, not just one string. Same shape as match-trophy-seen.ts,
 * kept as its own small file rather than merged — same convention as badge-seen.ts and
 * awards-ceremony-seen.ts living separately despite the conceptual overlap. */
export function monthlyTrophyId(trophy: { categoryKey: string; month: string }): string {
  return `${trophy.categoryKey}:${trophy.month}`
}

/** True only if this device has never recorded a monthly-trophy state for this user — the
 * one case where wins shouldn't be celebrated (nothing to diff against, and celebrating
 * every month already sitting in a player's history the moment this feature ships would
 * flood them instead of marking a genuine new win). */
export function hasNeverSeenMonthlyTrophies(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === null
  } catch {
    return true
  }
}

export function loadSeenMonthlyTrophyIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(userId))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSeenMonthlyTrophyIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable — the reveal just won't replay correctly, non-critical.
  }
}
