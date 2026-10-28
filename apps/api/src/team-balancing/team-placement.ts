import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';

/** Who `userId` must never share a team with, according to the admin's separation rules. */
export function separatedPartnersOf(
  userId: string,
  rules: Pick<PlayerSeparationRule, 'userAId' | 'userBId'>[],
): Set<string> {
  const partners = new Set<string>();
  for (const r of rules) {
    if (r.userAId === userId) partners.add(r.userBId);
    else if (r.userBId === userId) partners.add(r.userAId);
  }
  return partners;
}

/** The team a late arrival goes to: the smallest one — except a team holding someone they're
 * separated from, which is skipped as long as another team is at most one player larger
 * (headcount stays the first priority, exactly as in the full split). If every team is either
 * in conflict or too big, the smallest one wins and the rule is simply not honoured. */
export function pickTeamForNewcomer(teamCounts: number[], teamsWithPartner: Set<number>): number {
  const smallest = Math.min(...teamCounts);
  const acceptable = teamCounts
    .map((_, team) => team)
    .filter((team) => !teamsWithPartner.has(team) && teamCounts[team] <= smallest + 1);
  const pool = acceptable.length > 0 ? acceptable : teamCounts.map((_, team) => team);
  return pool.reduce((best, team) => (teamCounts[team] < teamCounts[best] ? team : best), pool[0]);
}

/** Convenience for callers holding the current assignments: counts per team, and which teams
 * already contain one of the newcomer's separated partners. */
export function teamsForNewcomer(
  assignments: { userId: string | null; teamIndex: number }[],
  teamCount: number,
  partners: Set<string>,
): number {
  const counts = new Array<number>(teamCount).fill(0);
  const conflicting = new Set<number>();
  for (const a of assignments) {
    counts[a.teamIndex]++;
    if (a.userId && partners.has(a.userId)) conflicting.add(a.teamIndex);
  }
  return pickTeamForNewcomer(counts, conflicting);
}
