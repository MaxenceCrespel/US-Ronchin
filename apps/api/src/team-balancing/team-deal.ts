import { PlayerPosition, PlayerSubPosition } from '../users/entities/user.entity';
import { BAND_BY_SUBPOSITION } from './bands';

export interface DealPlayer {
  userId: string;
  /** The real skill score — what a team's running total is made of. */
  score: number;
  /** What the players of a line are ranked by: the score plus the small regeneration jitter
   * (see SCORE_JITTER_RANGE), so "Régénérer" can reshuffle players who are practically tied
   * without ever flipping a genuine gap. */
  orderKey: number;
  /** The player's declared positions, primary first (see PositionPicker). */
  positions: PlayerSubPosition[];
}

/** 'NONE' = a player with no usable position (nothing declared, or a lone goalkeeper with no
 * secondary position) — dealt last, by score alone. */
export type Line = PlayerPosition | 'NONE';

// Goalkeepers first (only two spots to fill, one per team), then attack, midfield, defence,
// then whoever has no line.
const LINE_ORDER: Line[] = [
  PlayerPosition.GOALKEEPER,
  PlayerPosition.FORWARD,
  PlayerPosition.MIDFIELDER,
  PlayerPosition.DEFENDER,
  'NONE',
];

/** The line a player is dealt in when he is NOT one of the goalkeepers being split across
 * teams: his first declared position that isn't goalkeeper — so a lone goalkeeper plays his
 * secondary position, and an outfielder keeps his primary one. */
function outfieldLine(positions: PlayerSubPosition[]): Line {
  for (const position of positions) {
    const band = BAND_BY_SUBPOSITION[position];
    if (band !== PlayerPosition.GOALKEEPER) return band;
  }
  return 'NONE';
}

/** Splits the real players (guests are placed afterwards) across `teamCount` teams, by these
 * rules, in this order of priority:
 *
 * 1. Same number of players in every team (one apart at most, when the total doesn't divide).
 *    Every line below starts with the team that has FEWER players so far, so an odd-sized
 *    line can never leave one team ahead by more than one.
 * 2. Line by line, best player first, the players are dealt one team after the other: the best
 *    forward to one team, the second to the other, and so on. For fairness across lines, the
 *    team that starts a line is the one with fewer players and, at equal headcount, the LOWER
 *    running score total — the team that took the best forward doesn't also take the best
 *    midfielder.
 * 3. Goalkeepers aren't a line unless there are enough of them to give every team one: with
 *    two (for two teams) they go one to each team; a lone goalkeeper is dealt in his
 *    secondary position instead (and a goalkeeper left over from an odd number too).
 *
 * The admin-declared "never together" pairs are applied afterwards, by swapping players (see
 * TeamBalancingService.resolveSeparationRules), which keeps every headcount as it is. */
export function dealTeams(
  players: DealPlayer[],
  teamCount: number,
): { teamByUserId: Map<string, number>; lineByUserId: Map<string, Line> } {
  const teamByUserId = new Map<string, number>();
  const lineByUserId = new Map<string, Line>();
  const counts = new Array<number>(teamCount).fill(0);
  const sums = new Array<number>(teamCount).fill(0);
  const byBest = (a: DealPlayer, b: DealPlayer) => b.orderKey - a.orderKey;

  const goalkeepers = players.filter((p) => p.positions[0] === PlayerSubPosition.GOALKEEPER).sort(byBest);
  const splitKeepers = goalkeepers.slice(0, Math.floor(goalkeepers.length / teamCount) * teamCount);
  const splitKeeperIds = new Set(splitKeepers.map((p) => p.userId));

  const lines = new Map<Line, DealPlayer[]>(LINE_ORDER.map((line) => [line, []]));
  lines.get(PlayerPosition.GOALKEEPER)!.push(...splitKeepers);
  for (const player of players) {
    if (splitKeeperIds.has(player.userId)) continue;
    lines.get(outfieldLine(player.positions))!.push(player);
  }

  for (const line of LINE_ORDER) {
    const members = lines.get(line)!.sort(byBest);
    // Fewest players first, then lowest running total, then the lowest index (stable).
    const order = [...counts.keys()].sort((a, b) => counts[a] - counts[b] || sums[a] - sums[b] || a - b);
    members.forEach((player, i) => {
      const team = order[i % teamCount];
      teamByUserId.set(player.userId, team);
      lineByUserId.set(player.userId, line);
      counts[team] += 1;
      sums[team] += player.score;
    });
  }

  return { teamByUserId, lineByUserId };
}
