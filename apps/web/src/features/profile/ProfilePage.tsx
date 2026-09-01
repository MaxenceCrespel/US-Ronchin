import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Award, Bell, ChevronRight, KeyRound, Pencil, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import {
  AccountLevelDialog,
  AccountLevelRing,
  TIER_BADGE_CLASS,
  TIER_LABELS,
  TIER_ORDER,
  useAccountLevel,
} from '@/components/AccountLevelRing'
import { useCelebration } from '@/lib/useCelebration'
import { Confetti } from '@/components/Confetti'
import type { AccountTier } from '@/lib/types'
import { fetchBadgesForUser } from '@/features/badges/api'

/** A tappable row that navigates to a dedicated sub-page — this is the whole point of the
 * redesign: instead of every settings section piled up inline (long scroll, mostly closed
 * accordions), /profile is a short menu and each tap drills into its own screen. */
function ProfileNavBlock({
  to,
  icon,
  title,
  subtitle,
  tour,
}: {
  to: string
  icon: ReactNode
  title: string
  subtitle?: string
  tour?: string
}) {
  return (
    <Link
      to={to}
      data-tour={tour}
      className="bg-card text-card-foreground flex items-center gap-3 rounded-xl border px-4 py-3.5 shadow-sm transition-colors active:bg-accent"
    >
      <span className="bg-accent text-club-blue-dark flex size-9 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle && <span className="text-muted-foreground block text-xs">{subtitle}</span>}
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  )
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)

  const levelQuery = useAccountLevel(user?.id ?? '')
  const badgesQuery = useQuery({
    queryKey: ['badges', user?.id],
    queryFn: () => fetchBadgesForUser(user!.id),
    enabled: !!user,
  })
  const { active: tierUpCelebration, trigger: triggerTierUpCelebration } = useCelebration()
  const [tierJustReached, setTierJustReached] = useState<AccountTier | null>(null)
  useEffect(() => {
    const tier = levelQuery.data?.tier
    if (!tier || !user) return
    const storageKey = `last-seen-tier-${user.id}`
    const lastSeen = localStorage.getItem(storageKey) as AccountTier | null
    // Only celebrate a real climb — a first-ever visit (no stored tier yet) shouldn't pop
    // confetti for "Bronze", and a revoked badge dropping the tier back down shouldn't
    // either.
    if (lastSeen && TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(lastSeen)) {
      setTierJustReached(tier)
      triggerTierUpCelebration()
    }
    if (tier !== lastSeen) localStorage.setItem(storageKey, tier)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelQuery.data?.tier, user?.id])

  if (!user) return null

  const earnedCount = badgesQuery.data?.filter((b) => b.earned).length
  const badgesTotal = badgesQuery.data?.length

  return (
    <div className="flex flex-col gap-4">
      <Confetti active={tierUpCelebration} />
      {tierJustReached && (
        <div className="border-club-gold bg-club-gold/10 animate-pop-in mx-auto flex w-full max-w-xl items-center justify-center gap-2 rounded-lg border px-4 py-3 text-center text-sm font-medium">
          🎉 Nouveau palier — te voilà {TIER_LABELS[tierJustReached]} !
        </div>
      )}

      <Card className="mx-auto w-full max-w-xl" data-tour="profile-form">
        <CardHeader className="relative">
          <Link
            to="/profile/edit"
            aria-label="Modifier mon profil"
            className="border-input hover:bg-accent absolute top-6 right-6 flex size-9 shrink-0 items-center justify-center rounded-full border"
          >
            <Pencil className="size-4" />
          </Link>
          <div className="flex items-center gap-4 pr-11">
            {levelQuery.data ? (
                <AccountLevelDialog level={levelQuery.data}>
                  <AccountLevelRing userId={user.id} ringWidth={4}>
                    <PlayerAvatar
                      avatarUrl={user.avatarUrl}
                      firstName={user.firstName}
                      lastName={user.lastName}
                      size="xl"
                    />
                  </AccountLevelRing>
                </AccountLevelDialog>
              ) : (
                <AccountLevelRing userId={user.id} ringWidth={4}>
                  <PlayerAvatar
                    avatarUrl={user.avatarUrl}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    size="xl"
                  />
                </AccountLevelRing>
              )}
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate">
                    {user.firstName} {user.lastName}
                  </span>
                  {levelQuery.data && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                        TIER_BADGE_CLASS[levelQuery.data.tier],
                      )}
                    >
                      {TIER_LABELS[levelQuery.data.tier]}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="break-words">
                  {user.isLicensed ? 'Joueur licencié' : 'Joueur non licencié'} — {user.email}
                </CardDescription>
              </div>
          </div>
        </CardHeader>
      </Card>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5">
        <ProfileNavBlock
          to="/profile/badges"
          icon={<Award className="size-4" />}
          title="Badges"
          subtitle={
            earnedCount !== undefined && badgesTotal !== undefined
              ? `${earnedCount}/${badgesTotal} débloqués`
              : undefined
          }
          tour="profile-badges"
        />
        <ProfileNavBlock
          to="/profile/notifications"
          icon={<Bell className="size-4" />}
          title="Notifications"
        />
        <ProfileNavBlock
          to="/profile/password"
          icon={<KeyRound className="size-4" />}
          title="Mot de passe"
        />
        {hasCoachAccess(user) && (
          <ProfileNavBlock
            to="/profile/club"
            icon={<Settings className="size-4" />}
            title="Paramètres du club"
            subtitle="Visible uniquement par le coach"
          />
        )}
      </div>
    </div>
  )
}
