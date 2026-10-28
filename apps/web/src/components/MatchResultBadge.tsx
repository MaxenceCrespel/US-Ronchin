import { cn } from '@/lib/utils'
import { getMatchResult, RESULT_COLORS, RESULT_LABELS } from '@/lib/match-result'
import type { Match } from '@/lib/types'

/** Small "V"/"N"/"D" chip next to a score — a bare "2-1" isn't legible at a glance for an
 * away match or an unfamiliar opponent, this always reads victoire/nul/défaite from our
 * team's perspective. Renders nothing while the match has no final score yet. */
export function MatchResultBadge({
  match,
  className,
}: {
  match: Pick<Match, 'homeAway' | 'scoreHome' | 'scoreAway'>
  className?: string
}) {
  const result = getMatchResult(match)
  if (!result) return null
  return (
    <span
      className={cn(
        'font-display inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sm font-extrabold',
        RESULT_COLORS[result],
        className,
      )}
    >
      {RESULT_LABELS[result]}
    </span>
  )
}
