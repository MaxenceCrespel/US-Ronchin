import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { BadgeCategory, BadgeRarity, BadgeStatus } from '@/lib/types'
import { fetchBadgesForUser } from './api'

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  GOALS: 'Buts',
  ASSISTS: 'Passes décisives',
  MOTM: 'Homme du match',
  GOALKEEPER: 'Gardien',
  DEFENSE: 'Défense',
  MIDFIELD: 'Milieu',
  ATTENDANCE: 'Assiduité',
  EXPERIENCE: 'Expérience',
  DISCIPLINE: 'Discipline',
  IMPACT: 'Impact & résultats',
  SPECIAL: 'Spécial',
}

const CATEGORY_ORDER: BadgeCategory[] = [
  'GOALS',
  'ASSISTS',
  'MOTM',
  'GOALKEEPER',
  'DEFENSE',
  'MIDFIELD',
  'ATTENDANCE',
  'EXPERIENCE',
  'DISCIPLINE',
  'IMPACT',
  'SPECIAL',
]

export const RARITY_LABELS: Record<BadgeRarity, string> = {
  COMMON: 'Commun',
  RARE: 'Rare',
  EPIC: 'Épique',
  LEGENDARY: 'Légendaire',
}

/** Rarity drives the visual weight of a badge everywhere — gray/bronze for common,
 * up through a shimmering gold ring for legendary — independent of its category. */
export const RARITY_RING: Record<BadgeRarity, string> = {
  COMMON: 'border-stone-400 bg-stone-100',
  RARE: 'border-sky-500 bg-sky-500/10',
  EPIC: 'border-purple-500 bg-purple-500/10',
  LEGENDARY: 'border-amber-400 bg-gradient-to-br from-amber-200 via-yellow-100 to-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]',
}

export const RARITY_TEXT: Record<BadgeRarity, string> = {
  COMMON: 'text-stone-500',
  RARE: 'text-sky-600',
  EPIC: 'text-purple-600',
  LEGENDARY: 'text-amber-600',
}

function BadgeMedal({ badge, onOpen }: { badge: BadgeStatus; onOpen: () => void }) {
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
            badge.earned
              ? cn(
                  RARITY_RING[badge.rarity],
                  'animate-pop-in shadow-sm',
                  badge.rarity === 'LEGENDARY' && 'animate-legendary-pulse',
                )
              : 'border-dashed border-muted-foreground/25 bg-muted grayscale opacity-45',
          )}
        >
          {badge.emoji}
        </div>
        {badge.earned && badge.count > 1 && (
          <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
            ×{badge.count}
          </span>
        )}
      </div>
      <span className="w-20 text-[11px] leading-tight font-semibold">{badge.title}</span>
    </button>
  )
}

function formatEarnedDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function BadgesGrid({ userId }: { userId: string }) {
  const badgesQuery = useQuery({ queryKey: ['badges', userId], queryFn: () => fetchBadgesForUser(userId) })
  const [activeBadge, setActiveBadge] = useState<BadgeStatus | null>(null)
  const [expanded, setExpanded] = useState(true)

  const badges = badgesQuery.data ?? []
  const earnedCount = badges.filter((b) => b.earned).length

  const groups = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      badges: badges.filter((b) => b.category === category),
    })).filter((g) => g.badges.length > 0)
  }, [badges])

  return (
    <Card data-tour="profile-badges">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <CardHeader className="flex-1">
          <CardTitle>Badges</CardTitle>
          <CardDescription>
            {earnedCount}/{badges.length} débloqués
            {expanded && ' — touche un badge pour voir comment l\'obtenir'}
          </CardDescription>
        </CardHeader>
        <ChevronDown
          className={cn(
            'text-muted-foreground mr-6 size-5 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && (
        <CardContent className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.category} className="flex flex-col gap-2.5">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {CATEGORY_LABELS[group.category]}
              </h3>
              <div className="flex flex-wrap gap-4">
                {group.badges.map((badge) => (
                  <BadgeMedal key={badge.key} badge={badge} onOpen={() => setActiveBadge(badge)} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}

      <Dialog open={activeBadge !== null} onOpenChange={(open) => !open && setActiveBadge(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="items-center text-center">
            <div
              className={cn(
                'mb-1 flex size-20 items-center justify-center rounded-full border-2 text-4xl',
                activeBadge?.earned
                  ? cn(RARITY_RING[activeBadge.rarity])
                  : 'border-dashed border-muted-foreground/25 bg-muted grayscale opacity-60',
              )}
            >
              {activeBadge?.emoji}
            </div>
            {activeBadge && (
              <span
                className={cn(
                  'text-[10px] font-bold tracking-wide uppercase',
                  RARITY_TEXT[activeBadge.rarity],
                )}
              >
                {RARITY_LABELS[activeBadge.rarity]}
              </span>
            )}
            <DialogTitle>{activeBadge?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-muted-foreground text-sm">{activeBadge?.description}</p>
            {activeBadge?.progress && (
              <div className="flex w-full flex-col gap-1">
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-club-blue h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (activeBadge.progress.current / activeBadge.progress.target) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs font-medium">
                  {Math.min(activeBadge.progress.current, activeBadge.progress.target)}/
                  {activeBadge.progress.target}
                </p>
              </div>
            )}
            {activeBadge?.earned ? (
              <p className="text-xs font-medium text-emerald-600">
                {activeBadge.count > 1
                  ? `✅ Débloqué ${activeBadge.count} fois`
                  : `✅ Débloqué${activeBadge.earnedAt ? ` le ${formatEarnedDate(activeBadge.earnedAt)}` : ''}`}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">🔒 Pas encore débloqué</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
