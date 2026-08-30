import type { Match } from './types'

export type MatchResult = 'W' | 'D' | 'L'

/** Win/draw/loss from OUR team's perspective — null while the final score isn't in yet.
 * Same "our score vs their score" logic already duplicated in StatsPage's SeasonRecordCard
 * and BadgesService's resultOf, centralized here for every score display in the app. */
export function getMatchResult(
  match: Pick<Match, 'homeAway' | 'scoreHome' | 'scoreAway'>,
): MatchResult | null {
  const ourScore = match.homeAway === 'HOME' ? match.scoreHome : match.scoreAway
  const theirScore = match.homeAway === 'HOME' ? match.scoreAway : match.scoreHome
  if (ourScore == null || theirScore == null) return null
  if (ourScore > theirScore) return 'W'
  if (ourScore < theirScore) return 'L'
  return 'D'
}
