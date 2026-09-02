/** Points for one team in a training scrimmage: 3 for winning + the goal difference as a
 * bonus (capped at 5, so a blowout doesn't swing the ranking on one session), 1 each on a
 * draw, 0 for the losing team. Shared between TeamBalancingService (the "classement des
 * entraînements" page) and StatsService (folded into skillScore — see RATING_WEIGHT and
 * friends there) so both read the exact same scoring rule. */
export function pointsForResult(scoreTeam0: number, scoreTeam1: number): [number, number] {
  if (scoreTeam0 === scoreTeam1) return [1, 1];
  const bonus = Math.min(Math.abs(scoreTeam0 - scoreTeam1), 5);
  const winnerPoints = 3 + bonus;
  return scoreTeam0 > scoreTeam1 ? [winnerPoints, 0] : [0, winnerPoints];
}

/** Max a single session can ever award a team — a win with the full +5 blowout bonus. Used
 * to normalize an average points-per-session figure onto a 0-1 scale. */
export const MAX_POINTS_PER_SESSION = 8;
