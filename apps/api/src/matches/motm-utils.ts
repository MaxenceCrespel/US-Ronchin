export const MOTM_REVEAL_DELAY_MS = 24 * 60 * 60 * 1000;

interface VoteLike {
  /** Set when the target is a real account. */
  votedForId: string | null;
  /** Set instead of votedForId when the target is a guest (no account yet) — holds their
   * MatchComposition row id. */
  votedForGuestId: string | null;
  createdAt: Date;
}

/** Per-match userId → MatchComposition lookup, for resolving a direct vote (votedForId) to
 * the composition entry it targets — needed by computeMotmWinners to merge it with any guest
 * vote (votedForGuestId) cast for that SAME entry before it was linked to that account. */
export function groupCompositionByUserIdPerMatch(
  compositions: { id: string; matchId: string; userId: string | null }[],
): Map<string, Map<string, { id: string }>> {
  const result = new Map<string, Map<string, { id: string }>>();
  for (const c of compositions) {
    if (!c.userId) continue;
    const byUser = result.get(c.matchId) ?? new Map<string, { id: string }>();
    byUser.set(c.userId, c);
    result.set(c.matchId, byUser);
  }
  return result;
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
 * picked. Resolves each vote to the MatchComposition entry it targets FIRST — the same entry
 * whether cast directly against a real account (votedForId) or against a not-yet-linked
 * guest (votedForGuestId) — before tallying. Without this, a vote cast before a guest→account
 * link and a vote cast after it for the SAME person land in two separate buckets that can
 * each falsely tie for the top spot on their own, even though their merged total isn't
 * actually the max (this produced a real false MOTM/patron-de-la-défense badge — see the
 * matching bug already avoided by MatchesService.getMotm's own voteTarget, which this
 * mirrors). Returns MatchComposition ids — resolve them with resolveWinnerUserIds. */
export function computeMotmWinners(
  votes: VoteLike[],
  compositionByUserId: Map<string, { id: string }>,
): string[] {
  if (votes.length === 0) return [];
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const key = vote.votedForGuestId ?? compositionByUserId.get(vote.votedForId ?? '')?.id;
    if (!key) continue; // targeted someone no longer in this match's composition
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const max = Math.max(...counts.values());
  return [...counts.entries()].filter(([, count]) => count === max).map(([key]) => key);
}

/** Resolves computeMotmWinners' MatchComposition ids to real user ids — a winner still an
 * unlinked guest is dropped (nobody's stats/badges count them yet; they will once the coach
 * links that composition entry to an account), so the result can be shorter than the input. */
export function resolveWinnerUserIds(
  winnerCompositionIds: string[],
  compositionById: Map<string, { userId: string | null }>,
): string[] {
  const resolved: string[] = [];
  for (const id of winnerCompositionIds) {
    const userId = compositionById.get(id)?.userId ?? null;
    if (userId) resolved.push(userId);
  }
  return resolved;
}
