import { cn } from '@/lib/utils'
import { getMatchResult } from '@/lib/match-result'
import type { Match } from '@/lib/types'

const LABELS = { W: 'V', D: 'N', L: 'D' } as const

const COLORS = {
  W: 'bg-emerald-600/15 text-emerald-600',
  D: 'bg-amber-600/15 text-amber-600',
  L: 'bg-rose-600/15 text-rose-600',
} as const

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
        'inline-flex size-6 shrink-0 items-center justify-center rounded text-sm font-bold',
        COLORS[result],
        className,
      )}
    >
      {LABELS[result]}
    </span>
  )
}
