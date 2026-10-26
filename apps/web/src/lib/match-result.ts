import type { Match } from './types'

export type MatchResult = 'W' | 'D' | 'L'

/** Victoire / nul / défaite, as shown on every result chip. */
export const RESULT_LABELS: Record<MatchResult, string> = { W: 'V', D: 'N', L: 'D' }

/** Solid chips: the club's result greens/oranges, grey for a draw — colour never carries the
 * meaning alone, the letter always does. */
export const RESULT_COLORS: Record<MatchResult, string> = {
  W: 'bg-result-win text-white',
  D: 'bg-slate-500 text-white',
  L: 'bg-result-loss text-white',
}

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
