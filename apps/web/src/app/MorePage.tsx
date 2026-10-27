import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  Bell,
  ChevronRight,
  CircleHelp,
  FileUp,
  Gauge,
  KeyRound,
  LogOut,
  Settings,
  Star,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AccountLevelRing } from '@/components/AccountLevelRing'

interface Tile {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

function TileGrid({ title, tiles, dark }: { title: string; tiles: Tile[]; dark?: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-bold tracking-widest uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex min-h-20 flex-col justify-between gap-2 rounded-2xl p-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5',
              dark ? 'bg-club-blue-dark text-white' : 'bg-card border',
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </section>
  )
}

/** The phone's "Plus" tab: everything that doesn't have its own tab, as tiles grouped by who
 * it's for — the club for everyone, then coach and super-admin tools only for those roles. */
export function MorePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const replayOnboarding = useOnboardingUiStore((s) => s.replay)
  if (!user) return null
  const isCoach = hasCoachAccess(user)
  const roleLabel = user.role === 'SUPERADMIN' ? 'Super-admin' : user.role === 'COACH' ? 'Coach' : 'Joueur'

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <h1 className="font-display text-3xl leading-tight font-extrabold uppercase">Plus</h1>

      <Link
        to="/profile"
        className="bg-club-blue-dark flex items-center gap-3 rounded-2xl p-3 text-white transition-transform hover:-translate-y-0.5"
      >
        <AccountLevelRing userId={user.id} ringWidth={2}>
          <PlayerAvatar avatarUrl={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} />
        </AccountLevelRing>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">
            {user.firstName} {user.lastName}
          </span>
          <span className="text-xs text-white/80">{roleLabel} · Mon profil</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-white/70" />
      </Link>

      <TileGrid
        title="Club"
        tiles={[
          { to: '/championship', label: 'Championnat', icon: Trophy },
          { to: '/coupe', label: 'Coupe', icon: Swords },
          { to: '/players', label: 'Effectif', icon: Users },
          { to: '/profile/badges', label: 'Mes badges', icon: Award },
        ]}
      />

      {isCoach && (
        <TileGrid
          title="Gestion · coach"
          dark
          tiles={[
            { to: '/player-ratings', label: 'Niveau des joueurs', icon: Star },
            { to: '/admin/import-pdf', label: 'Feuille de match', icon: FileUp },
            { to: '/profile/club', label: 'Paramètres du club', icon: Settings },
          ]}
        />
      )}

      {user.role === 'SUPERADMIN' && (
        <TileGrid title="Super-admin" tiles={[{ to: '/admin', label: 'Tableau de bord', icon: Gauge }]} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-bold tracking-widest uppercase">Compte</h2>
        <div className="bg-card divide-y overflow-hidden rounded-2xl border">
          {[
            { to: '/profile/trophies', label: 'Ma vitrine de trophées', icon: Trophy },
            { to: '/profile/notifications', label: 'Notifications', icon: Bell },
            { to: '/profile/password', label: 'Mot de passe', icon: KeyRound },
          ].map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="hover:bg-accent flex min-h-12 items-center gap-3 px-4 text-sm font-medium">
              <Icon className="text-club-blue size-4" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="text-muted-foreground size-4" />
            </Link>
          ))}
          <button
            type="button"
            onClick={replayOnboarding}
            className="hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium"
          >
            <CircleHelp className="text-club-blue size-4" />
            <span className="flex-1">Revoir le tuto de bienvenue</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="text-result-loss hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-semibold"
          >
            <LogOut className="size-4" />
            Déconnexion
          </button>
        </div>
      </section>
    </div>
  )
}
