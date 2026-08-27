import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { AccountLevel, AccountTier, BadgeRarity } from '@/lib/types'
import { fetchAccountLevel, fetchAllAccountLevels } from '@/features/badges/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RARITY_LABELS } from '@/features/badges/BadgesGrid'

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

// Mirrors the backend's TIER_THRESHOLDS/RARITY_WEIGHT (badges.service.ts) — duplicated
// here purely for display since the API only returns the current/next tier, not the
// full ladder or the point value of each rarity.
export const TIER_ORDER: AccountTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'RUBY']
const TIER_MIN_SCORE: Record<AccountTier, number> = {
  BRONZE: 0,
  SILVER: 5,
  GOLD: 15,
  PLATINUM: 30,
  DIAMOND: 55,
  RUBY: 90,
}
const RARITY_WEIGHT: Record<BadgeRarity, number> = {
  COMMON: 1,
  RARE: 3,
  EPIC: 8,
  LEGENDARY: 20,
}
const RARITY_ORDER: BadgeRarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']

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

/** Wraps an AccountLevelRing (or anything else) to open a dialog on click showing progress
 * toward the next tier and what each badge rarity is worth — the ring alone only shows the
 * current tier's color, not how close the next one is. */
export function AccountLevelDialog({ level, children }: { level: AccountLevel; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pointsToNext = level.nextTierScore != null ? level.nextTierScore - level.score : null
  const pct =
    level.nextTierScore != null ? Math.min(100, (level.score / level.nextTierScore) * 100) : 100

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded-full">
        {children}
      </button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Niveau du compte</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase',
                TIER_BADGE_CLASS[level.tier],
              )}
            >
              {TIER_LABELS[level.tier]}
            </span>
            <span className="text-muted-foreground text-sm">{level.score} pts</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all', TIER_RING[level.tier])}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {level.nextTier && pointsToNext != null
                ? `${pointsToNext} point${pointsToNext > 1 ? 's' : ''} avant ${TIER_LABELS[level.nextTier]}`
                : 'Niveau maximum atteint 🎉'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 border-t pt-3">
            <p className="text-xs font-semibold">Paliers</p>
            {TIER_ORDER.map((tier) => (
              <div key={tier} className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    'text-muted-foreground',
                    tier === level.tier && 'text-foreground font-semibold',
                  )}
                >
                  {TIER_LABELS[tier]}
                </span>
                <span className="text-muted-foreground">{TIER_MIN_SCORE[tier]} pts</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 border-t pt-3">
            <p className="text-xs font-semibold">Valeur des badges</p>
            <p className="text-muted-foreground text-xs">
              Chaque badge débloqué rapporte des points selon sa rareté :
            </p>
            {RARITY_ORDER.map((rarity) => (
              <div key={rarity} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{RARITY_LABELS[rarity]}</span>
                <span className="text-muted-foreground">
                  {RARITY_WEIGHT[rarity]} pt{RARITY_WEIGHT[rarity] > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
