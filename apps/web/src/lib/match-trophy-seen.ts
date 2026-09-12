function seenKey(userId: string) {
  return `seen-match-trophies-${userId}`
}

/** A match trophy isn't one recurring "period" like a season/month (see
 * awards-ceremony-seen.ts) — a player can be shown several distinct matches' results at
 * different times, so this tracks a whole set of already-shown `${matchId}:${kind}` ids, not
 * just one string (the caller builds these — MatchTrophyRevealItem's own `id` is already in
 * that exact shape). Tracks "has this device seen this match's result", not "did this player
 * win it" — MatchTrophyReveal shows to every player who took part in the match, win or lose.
 *
 * True only if this device has never recorded a match-trophy state for this user — the one
 * case where results shouldn't be shown (nothing to diff against, and showing every result
 * already sitting in the match history the moment this feature ships would flood them
 * instead of marking a genuinely new reveal). */
export function hasNeverSeenMatchTrophies(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === null
  } catch {
    return true
  }
}

export function loadSeenMatchTrophyIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(userId))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSeenMatchTrophyIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable — the reveal just won't replay correctly, non-critical.
  }
}
