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
 * key for a still-unlinked guest. Resolve to an actual user id with resolveWinnerUserId. */
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

/** Winner is whoever has the most votes; ties broken by first to reach that count. Returns
 * a target key (see targetKey) — resolve it with resolveWinnerUserId. */
export function computeMotmWinner(votes: VoteLike[]): string | null {
  const counts = new Map<string, number>();
  let winnerKey: string | null = null;
  let max = 0;
  for (const vote of votes) {
    const key = targetKey(vote);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > max) {
      max = next;
      winnerKey = key;
    }
  }
  return winnerKey;
}

/** Resolves a computeMotmWinner key to a real user id — null if the winner is still an
 * unlinked guest, in which case nobody's stats/badges count it yet (they will once the
 * coach links that composition entry to an account). */
export function resolveWinnerUserId(
  winnerKey: string | null,
  compositionById: Map<string, { userId: string | null }>,
): string | null {
  if (!winnerKey) return null;
  if (winnerKey.startsWith('guest:')) {
    return compositionById.get(winnerKey.slice('guest:'.length))?.userId ?? null;
  }
  return winnerKey;
}
