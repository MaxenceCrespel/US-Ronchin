import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarDays, CircleHelp, Gauge, Home, Menu, ShieldHalf, Trophy, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import type { UserRole } from '@/lib/types'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AccountLevelRing } from '@/components/AccountLevelRing'
import { BadgeUnlockWatcher } from '@/components/BadgeUnlockWatcher'
import { OnboardingTour } from '@/components/OnboardingTour'
import { InstallAppBanner } from '@/components/InstallAppBanner'

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
  { to: '/stats', label: 'Stats', icon: Trophy, tour: 'nav-stats' },
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

export function Layout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const replayOnboarding = useOnboardingUiStore((s) => s.replay)
  const isCoach = user?.role === 'COACH'
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-svh">
      <BadgeUnlockWatcher />
      <OnboardingTour />

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
              <p className="text-sm font-bold tracking-wide text-white uppercase">US Ronchin</p>
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
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5 sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="text-foreground md:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-3">
            {user && (
              <Link
                to="/profile"
                className="hover:bg-accent flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors"
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
                  <p className="text-muted-foreground text-xs">{isCoach ? 'Coach' : 'Joueur'}</p>
                </div>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={replayOnboarding}
              aria-label="Revoir le tutoriel"
              title="Revoir le tutoriel"
            >
              <CircleHelp className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              Déconnexion
            </Button>
          </div>
        </header>
        <InstallAppBanner />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto w-full min-w-0 max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
