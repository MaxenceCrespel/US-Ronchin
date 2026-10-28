import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, CircleHelp, Ellipsis, Gauge, Home, ShieldHalf, Swords, Trophy, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import type { UserRole } from '@/lib/types'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AccountLevelRing } from '@/components/AccountLevelRing'
import { BadgeUnlockWatcher } from '@/components/BadgeUnlockWatcher'
import { SessionSync } from '@/features/auth/SessionSync'
import { PushSync } from '@/features/push/PushSync'
import { MandatoryVotePopup } from '@/features/awards/MandatoryVotePopup'
import { VoteReminderBanner } from '@/features/awards/VoteReminderBanner'
import { PlayerRatingsReminder } from '@/features/players/PlayerRatingsReminder'
import { InstallAppBanner } from '@/components/InstallAppBanner'
import { OfflineBanner } from '@/components/OfflineBanner'
import { NotificationPrompt } from '@/components/NotificationPrompt'
import { SkipLink, SrHeading, getRouteHelp } from '@/lib/route-meta'

// Full-screen celebrations and the tour are rarely on screen — keep their (heavy) code out of
// the first load.
const AwardsCeremonyWatcher = lazy(() => import('@/features/awards/AwardsCeremonyWatcher').then((m) => ({ default: m.AwardsCeremonyWatcher })))
const MonthlyTrophyUnlockWatcher = lazy(() => import('@/features/awards/MonthlyTrophyUnlockWatcher').then((m) => ({ default: m.MonthlyTrophyUnlockWatcher })))
const MatchTrophyUnlockWatcher = lazy(() => import('@/features/matches/MatchTrophyUnlockWatcher').then((m) => ({ default: m.MatchTrophyUnlockWatcher })))
const TrophySnapshotHost = lazy(() => import('@/features/awards/TrophySnapshot').then((m) => ({ default: m.TrophySnapshotHost })))
const OnboardingTour = lazy(() => import('@/components/OnboardingTour').then((m) => ({ default: m.OnboardingTour })))

const navItems: {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  tour: string
  roles?: UserRole[]
}[] = [
  { to: '/', label: 'Accueil', icon: Home, end: true, tour: 'nav-home' },
  { to: '/trainings', label: 'Entraînements', icon: CalendarDays, tour: 'nav-trainings' },
  { to: '/matches', label: 'Matchs', icon: ShieldHalf, tour: 'nav-matches' },
  { to: '/championship', label: 'Championnat', icon: Trophy, tour: 'nav-championship' },
  { to: '/coupe', label: 'Coupe', icon: Swords, tour: 'nav-coupe' },
  { to: '/stats', label: 'Stats', icon: BarChart3, tour: 'nav-stats' },
  { to: '/players', label: 'Effectif', icon: Users, tour: 'nav-players' },
  { to: '/admin', label: 'Admin', icon: Gauge, tour: 'nav-admin', roles: ['SUPERADMIN'] },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-white text-club-blue-dark shadow-sm'
      : 'text-white/85 hover:bg-white/15 hover:text-white',
  )

/** The phone's main navigation — the four screens players open every week, plus "Plus" for the
 * rest (the /plus page of tiles). Hidden from md up, where the sidebar is always on screen. */
const tabItems: { to: string; label: string; icon: typeof Home; end?: boolean }[] = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/trainings', label: 'Entraîn.', icon: CalendarDays },
  { to: '/matches', label: 'Matchs', icon: ShieldHalf },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
]

const tabClass = (isActive: boolean) =>
  cn(
    'flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] transition-colors',
    isActive ? 'text-club-blue font-bold' : 'text-muted-foreground font-semibold',
  )

function MobileTabBar({ moreActive }: { moreActive: boolean }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="bg-card fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
    >
      {tabItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </>
          )}
        </NavLink>
      ))}
      <Link to="/plus" className={tabClass(moreActive)} aria-current={moreActive ? 'page' : undefined}>
        <Ellipsis className="size-[22px]" strokeWidth={moreActive ? 2.4 : 2} />
        Plus
      </Link>
    </nav>
  )
}

export function Layout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const replayOnboarding = useOnboardingUiStore((s) => s.replay)
  const roleLabel = user?.role === 'SUPERADMIN' ? 'Super-admin' : user?.role === 'COACH' ? 'Coach' : 'Joueur'
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const pageHelp = getRouteHelp(location.pathname)
  const onTab = tabItems.some(({ to, end }) =>
    end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`),
  )

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    setHelpOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-svh">
      <SkipLink />
      <SessionSync />
      <PushSync />
      <BadgeUnlockWatcher />
      <MandatoryVotePopup />
      <Suspense fallback={null}>
        <AwardsCeremonyWatcher />
        <MonthlyTrophyUnlockWatcher />
        <MatchTrophyUnlockWatcher />
        <TrophySnapshotHost />
        <OnboardingTour />
      </Suspense>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'from-club-blue to-club-blue-dark fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-4 bg-gradient-to-b py-4 shadow-md transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-3 md:px-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/club-logo.png"
              alt="US Ronchin"
              className="animate-net-wobble h-9 w-9 shrink-0 drop-shadow"
            />
            <div className="leading-tight">
              <p className="font-display text-lg leading-none font-extrabold tracking-wide text-white uppercase">US Ronchin</p>
              <p className="text-club-gold text-xs font-medium">Football · Depuis 1902</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="text-white/80 hover:text-white md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-2 md:px-3">
          {navItems
            .filter((item) => !item.roles || (user && item.roles.includes(user.role)))
            .map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={navLinkClass}
              title={label}
              data-tour={tour}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On a phone the header carries the club's identity (the sidebar is tucked behind
            "Plus"), so it takes the club's dark blue; from md up it's the light utility bar. */}
        <header className="max-md:bg-club-blue-dark flex items-center justify-between gap-3 px-4 py-2.5 max-md:text-white md:justify-end md:border-b md:px-6">
          <Link to="/" className="flex items-center gap-2.5 md:hidden">
            <img src="/club-logo.png" alt="" className="size-8 shrink-0" />
            <span className="font-display text-lg font-extrabold tracking-wide uppercase">US Ronchin</span>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <Link
                to="/profile"
                className="md:hover:bg-accent flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-white/15 sm:pr-3"
                data-tour="nav-profile"
              >
                <AccountLevelRing userId={user.id} ringWidth={2}>
                  <PlayerAvatar
                    avatarUrl={user.avatarUrl}
                    firstName={user.firstName}
                    lastName={user.lastName}
                  />
                </AccountLevelRing>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-sm font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-muted-foreground text-xs max-md:text-white/75">{roleLabel}</p>
                </div>
              </Link>
            )}
            {pageHelp && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full hover:bg-white/15 hover:text-white md:size-8 md:hover:bg-accent md:hover:text-accent-foreground"
                onClick={() => setHelpOpen(true)}
                aria-label="Aide sur cet écran"
                title="Aide sur cet écran"
              >
                <CircleHelp className="size-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={logout} className="hidden md:inline-flex">
              Déconnexion
            </Button>
          </div>
        </header>

        {pageHelp && (
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{pageHelp.title}</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground text-sm">{pageHelp.help}</p>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setHelpOpen(false)
                  replayOnboarding()
                }}
              >
                Revoir le tuto de bienvenue
              </Button>
            </DialogContent>
          </Dialog>
        )}
        <OfflineBanner />
        <VoteReminderBanner />
        <PlayerRatingsReminder />
        <InstallAppBanner />
        <NotificationPrompt />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none sm:px-6 md:pb-6">
          <div className="mx-auto w-full min-w-0 max-w-6xl">
            <SrHeading />
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar moreActive={!onTab} />
    </div>
  )
}
