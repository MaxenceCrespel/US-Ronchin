import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { AccountTier } from '@/lib/types'
import { fetchAccountLevel, fetchAllAccountLevels } from '@/features/badges/api'

export const TIER_LABELS: Record<AccountTier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
  DIAMOND: 'Diamant',
  RUBY: 'Rubis',
}

export const TIER_BADGE_CLASS: Record<AccountTier, string> = {
  BRONZE: 'bg-amber-800/15 text-amber-800',
  SILVER: 'bg-slate-400/20 text-slate-600',
  GOLD: 'bg-amber-400/20 text-amber-600',
  PLATINUM: 'bg-teal-400/20 text-teal-700',
  DIAMOND: 'bg-sky-400/20 text-sky-600',
  RUBY: 'bg-rose-500/20 text-rose-700',
}

const TIER_RING: Record<AccountTier, string> = {
  BRONZE: 'bg-gradient-to-br from-amber-700 to-amber-950',
  SILVER: 'bg-gradient-to-br from-slate-300 to-slate-500',
  GOLD: 'bg-gradient-to-br from-yellow-300 to-amber-500',
  PLATINUM: 'bg-gradient-to-br from-cyan-200 to-teal-500',
  DIAMOND: 'bg-gradient-to-br from-sky-300 via-cyan-200 to-blue-500 animate-ring-diamond',
  RUBY: 'bg-gradient-to-br from-rose-400 via-red-500 to-rose-800 animate-ring-ruby',
}

export function useAccountLevel(userId: string) {
  return useQuery({
    queryKey: ['account-level', userId],
    queryFn: () => fetchAccountLevel(userId),
    enabled: !!userId,
  })
}

/** One request for every player's level — use this on a roster/match-sheet list instead
 * of mounting one AccountLevelRing per row (each would otherwise fire its own request). */
export function useAllAccountLevels() {
  return useQuery({
    queryKey: ['account-levels'],
    queryFn: fetchAllAccountLevels,
  })
}

/** Wraps an avatar with a colored ring reflecting the player's overall account level
 * (Bronze → Silver → Gold → Platinum → Diamond → Ruby), derived from their badges.
 * Pass `tier` directly (e.g. from useAllAccountLevels) to skip the per-player fetch. */
export function AccountLevelRing({
  userId,
  tier: tierProp,
  ringWidth = 3,
  children,
  className,
}: {
  userId?: string
  tier?: AccountTier
  ringWidth?: number
  children: ReactNode
  className?: string
}) {
  const levelQuery = useAccountLevel(tierProp ? '' : (userId ?? ''))
  const tier = tierProp ?? levelQuery.data?.tier ?? 'BRONZE'

  return (
    <div
      className={cn('inline-flex shrink-0 rounded-full', TIER_RING[tier], className)}
      style={{ padding: ringWidth }}
    >
      {children}
    </div>
  )
}
