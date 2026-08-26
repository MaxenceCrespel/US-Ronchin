import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatCountdown(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min`
}

/** Shared tracker for MOTM / patron de la défense voting — visible to everyone regardless
 * of whether they've voted, so the whole group can see where it stands. Ticks the countdown
 * live once the 24h window has actually started (first vote cast). */
export function VoteProgress({
  totalVotes,
  totalPlayers,
  votingClosesAt,
  barClassName = 'bg-club-gold',
  compact = false,
}: {
  totalVotes: number
  totalPlayers: number
  votingClosesAt: string | null
  /** Bar fill color — defaults to the MOTM gold, pass a match-category accent to match it
   * to the card it's shown on. */
  barClassName?: string
  /** Tighter spacing/text for use inside a small card (e.g. the matches list). */
  compact?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!votingClosesAt) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [votingClosesAt])

  const pct = totalPlayers > 0 ? Math.min(100, (totalVotes / totalPlayers) * 100) : 0
  const remainingMs = votingClosesAt ? new Date(votingClosesAt).getTime() - now : null

  return (
    <div className={cn('flex flex-col gap-1.5', compact && 'gap-1')}>
      <div className={cn('bg-muted w-full overflow-hidden rounded-full', compact ? 'h-1' : 'h-1.5')}>
        <div className={cn('h-full rounded-full transition-all', barClassName)} style={{ width: `${pct}%` }} />
      </div>
      <div
        className={cn(
          'text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1',
          compact ? 'text-[11px]' : 'text-xs',
        )}
      >
        <span>
          {totalVotes}/{totalPlayers} ont voté
        </span>
        {remainingMs != null && remainingMs > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className={compact ? 'size-2.5' : 'size-3'} />
            {formatCountdown(remainingMs)} restantes
          </span>
        )}
      </div>
    </div>
  )
}
