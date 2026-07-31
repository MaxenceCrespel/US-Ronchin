import type { Match } from './types'

export type MatchCategory = 'FRIENDLY' | 'CUP' | 'LEAGUE'

export function getMatchCategory(match: Pick<Match, 'source' | 'competition'>): MatchCategory {
  if (match.source === 'FRIENDLY') return 'FRIENDLY'
  if (match.competition?.toLowerCase().includes('coupe')) return 'CUP'
  return 'LEAGUE'
}

export const MATCH_CATEGORY_LABELS: Record<MatchCategory, string> = {
  FRIENDLY: 'Amical',
  CUP: 'Coupe',
  LEAGUE: 'Championnat',
}

/** Left-border accent color per category, for quick visual scanning. */
export const MATCH_CATEGORY_BORDER: Record<MatchCategory, string> = {
  FRIENDLY: 'border-[#8b5a2b]',
  CUP: 'border-club-gold',
  LEAGUE: 'border-club-blue',
}
