import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { BadgeCategory, BadgeHolderGroup } from '@/lib/types'
import { CATEGORY_LABELS, CATEGORY_ORDER, RARITY_LABELS, RARITY_RING, RARITY_TEXT } from '@/features/badges/BadgesGrid'
import { fetchBadgeHolders } from '@/features/badges/api'

function formatEarnedDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Same medal look as the player-facing BadgesGrid, but "earned" here means "at least one
 * holder" rather than "this viewer earned it" — the count badge shows how many players
 * hold it, not how many times one player unlocked it. */
function BadgeMedal({ group, onOpen }: { group: BadgeHolderGroup; onOpen: () => void }) {
  const earned = group.holders.length > 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-center gap-1.5 text-center"
    >
      <div className="relative">
        <div
          className={cn(
            'flex size-16 items-center justify-center rounded-full border-2 text-2xl transition-all duration-200 active:scale-95',
            earned
              ? cn(RARITY_RING[group.rarity], 'shadow-sm')
              : 'border-dashed border-muted-foreground/25 bg-muted grayscale opacity-45',
          )}
        >
          {group.emoji}
        </div>
        {earned && (
          <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
            {group.holders.length}
          </span>
        )}
      </div>
      <span className="w-20 text-[11px] leading-tight font-semibold">{group.title}</span>
    </button>
  )
}

/** Admin-only view of every badge in the game, grouped by category exactly like the
 * player-facing grid — except opening one lists WHO holds it instead of how to earn it. */
export function BadgeHoldersPanel() {
  const holdersQuery = useQuery({ queryKey: ['admin', 'badge-holders'], queryFn: fetchBadgeHolders })
  const [activeBadge, setActiveBadge] = useState<BadgeHolderGroup | null>(null)

  const groups = holdersQuery.data ?? []
  const totalHolders = groups.reduce((sum, g) => sum + g.holders.length, 0)

  const byCategory = useMemo(() => {
    return CATEGORY_ORDER.map((category: BadgeCategory) => ({
      category,
      groups: groups.filter((g) => g.category === category),
    })).filter((c) => c.groups.length > 0)
  }, [groups])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Badges</CardTitle>
        <CardDescription>
          {groups.length} badges au total — {totalHolders} obtentions au total. Touche un badge pour voir qui
          l'a obtenu.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {byCategory.map(({ category, groups: categoryGroups }) => (
          <div key={category} className="flex flex-col gap-2.5">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="flex flex-wrap gap-4">
              {categoryGroups.map((group) => (
                <BadgeMedal key={group.key} group={group} onOpen={() => setActiveBadge(group)} />
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={activeBadge !== null} onOpenChange={(open) => !open && setActiveBadge(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="items-center text-center">
            <div
              className={cn(
                'mb-1 flex size-20 items-center justify-center rounded-full border-2 text-4xl',
                activeBadge && activeBadge.holders.length > 0
                  ? cn(RARITY_RING[activeBadge.rarity])
                  : 'border-dashed border-muted-foreground/25 bg-muted grayscale opacity-60',
              )}
            >
              {activeBadge?.emoji}
            </div>
            {activeBadge && (
              <span className={cn('text-[10px] font-bold tracking-wide uppercase', RARITY_TEXT[activeBadge.rarity])}>
                {RARITY_LABELS[activeBadge.rarity]}
              </span>
            )}
            <DialogTitle>{activeBadge?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {activeBadge?.holders.length ? (
              activeBadge.holders.map((holder) => (
                <div
                  key={holder.userId}
                  className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="font-medium">
                    {holder.firstName} {holder.lastName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {holder.count > 1 ? `×${holder.count} — ` : ''}
                    {formatEarnedDate(holder.earnedAt)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground py-2 text-center text-xs">
                🔒 Personne ne l'a encore obtenu
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
