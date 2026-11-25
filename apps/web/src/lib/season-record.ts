import type { Match } from './types'
import { getMatchResult } from './match-result'

/** Bilan de la saison vu de NOTRE équipe, pour la carte « Bilan » de la page Stats. */
export interface SeasonRecord {
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  goalDifference: number
}

/** Victoire 3 points, nul 1 point, défaite 0 (barème du district). */
export function getSeasonRecord(
  matches: Pick<Match, 'homeAway' | 'scoreHome' | 'scoreAway'>[],
): SeasonRecord {
  const record: SeasonRecord = { played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalDifference: 0 }
  for (const match of matches) {
    const result = getMatchResult(match)
    record.played++
    if (result === 'W') {
      record.wins++
      record.points += 3
    } else if (result === 'L') {
      record.losses++
    } else {
      record.draws++
      record.points += 1
    }
    record.goalDifference += (match.scoreHome ?? 0) - (match.scoreAway ?? 0)
  }
  return record
}
