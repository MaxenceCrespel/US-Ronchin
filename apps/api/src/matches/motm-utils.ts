export const MOTM_REVEAL_DELAY_MS = 24 * 60 * 60 * 1000;

interface VoteLike {
  votedForId: string;
  createdAt: Date;
}

/** True once every player in the composition has voted, or 24h after the first vote. */
export function isMotmRevealed(votes: VoteLike[], totalPlayers: number): boolean {
  if (votes.length === 0) return false;
  if (votes.length >= totalPlayers) return true;

  const firstVoteAt = votes.reduce<Date>(
    (earliest, v) => (v.createdAt < earliest ? v.createdAt : earliest),
    votes[0].createdAt,
  );
  return Date.now() - firstVoteAt.getTime() >= MOTM_REVEAL_DELAY_MS;
}

/** Winner is whoever has the most votes; ties broken by first to reach that count. */
export function computeMotmWinner(votes: VoteLike[]): string | null {
  const counts = new Map<string, number>();
  let winnerId: string | null = null;
  let max = 0;
  for (const vote of votes) {
    const next = (counts.get(vote.votedForId) ?? 0) + 1;
    counts.set(vote.votedForId, next);
    if (next > max) {
      max = next;
      winnerId = vote.votedForId;
    }
  }
  return winnerId;
}
