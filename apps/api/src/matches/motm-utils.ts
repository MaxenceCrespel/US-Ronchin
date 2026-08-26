export const MOTM_REVEAL_DELAY_MS = 24 * 60 * 60 * 1000;

interface VoteLike {
  /** Set when the target is a real account. */
  votedForId: string | null;
  /** Set instead of votedForId when the target is a guest (no account yet) — holds their
   * MatchComposition row id. */
  votedForGuestId: string | null;
  createdAt: Date;
}

/** Opaque grouping key for tallying — a real user id as-is, or a "guest:<compositionId>"
 * key for a still-unlinked guest. Resolve to actual user ids with resolveWinnerUserIds. */
function targetKey(vote: VoteLike): string {
  return vote.votedForId ?? `guest:${vote.votedForGuestId}`;
}

/** Earliest createdAt among the votes — the moment the 24h countdown starts. */
export function firstVoteAt(votes: VoteLike[]): Date | null {
  if (votes.length === 0) return null;
  return votes.reduce<Date>((earliest, v) => (v.createdAt < earliest ? v.createdAt : earliest), votes[0].createdAt);
}

/** True once every player in the composition has voted, or 24h after the first vote. */
export function isMotmRevealed(votes: VoteLike[], totalPlayers: number): boolean {
  if (votes.length === 0) return false;
  if (votes.length >= totalPlayers) return true;

  const first = firstVoteAt(votes)!;
  return Date.now() - first.getTime() >= MOTM_REVEAL_DELAY_MS;
}

/** Everyone tied for the most votes — a 3-way tie means 3 winners, not one arbitrarily
 * picked. Returns target keys (see targetKey) — resolve them with resolveWinnerUserIds. */
export function computeMotmWinners(votes: VoteLike[]): string[] {
  if (votes.length === 0) return [];
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const key = targetKey(vote);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  return [...counts.entries()].filter(([, count]) => count === max).map(([key]) => key);
}

/** Resolves computeMotmWinners keys to real user ids — a winner still an unlinked guest is
 * dropped (nobody's stats/badges count them yet; they will once the coach links that
 * composition entry to an account), so the result can be shorter than the input. */
export function resolveWinnerUserIds(
  winnerKeys: string[],
  compositionById: Map<string, { userId: string | null }>,
): string[] {
  const resolved: string[] = [];
  for (const key of winnerKeys) {
    const userId = key.startsWith('guest:')
      ? (compositionById.get(key.slice('guest:'.length))?.userId ?? null)
      : key;
    if (userId) resolved.push(userId);
  }
  return resolved;
}
