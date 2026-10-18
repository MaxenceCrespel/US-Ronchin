import type { ReactNode } from 'react'
import { Crown, Shield, Star } from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ratingColor, ratingLabel } from './rating-color'

export interface SpotlightPlayer {
  compositionId: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
  rating: number | null
  votes: number
  /** Short stat line under the avatar, e.g. "2 buts · 1 passe déc." — omitted when the
   * player's match sheet has nothing notable beyond the award itself. */
  statLine?: string
  /** Small stat chips (goals/assists/cards), MPG-style — used by the "top players" leaderboard
   * where there's no vote count to fall back on, only what's on the match sheet. */
  stats?: { icon: string; label: string }[]
}

const ROLE_STYLE = {
  motm: {
    label: 'Homme du match',
    Icon: Crown,
    gradient: 'from-club-gold/90 via-club-gold to-[#b8860b]',
    ring: 'ring-white/70',
  },
  defense: {
    label: 'Patron de la défense',
    Icon: Shield,
    gradient: 'from-club-blue to-club-blue-dark',
    ring: 'ring-white/70',
  },
  top: {
    label: 'Meilleur joueur',
    Icon: Star,
    gradient: 'from-slate-600 to-slate-800',
    ring: 'ring-white/70',
  },
} as const

/** One trading-card-style honoree — MPG-inspired, built from this app's own tokens (club
 * gold for MOTM, club blue for the defense award) rather than copying MPG's exact look. */
export function PlayerSpotlightCard({
  role,
  player,
}: {
  role: keyof typeof ROLE_STYLE
  player: SpotlightPlayer
}) {
  const style = ROLE_STYLE[role]
  return (
    <div
      className={`relative flex h-full w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-gradient-to-br shadow-md ${style.gradient}`}
    >
      <div className="flex items-center justify-between px-2.5 pt-2.5">
        <span className="flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
          <style.Icon className="size-3" />
        </span>
        <span
          className="flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-extrabold text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          style={{ background: player.rating == null ? 'rgba(0,0,0,0.3)' : ratingColor(player.rating) }}
        >
          {ratingLabel(player.rating)}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-2">
        <PlayerAvatar
          avatarUrl={player.avatarUrl}
          firstName={player.firstName}
          lastName={player.lastName}
          size="xl"
          className={`border-0 bg-white/15 ring-4 ${style.ring}`}
        />
      </div>

      {player.stats && player.stats.length > 0 && (
        <div className="flex justify-center gap-1 px-2 pb-1.5">
          {player.stats.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-1 text-[11px] font-semibold text-white"
            >
              <span>{s.icon}</span>
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-0.5 bg-black/25 px-2 py-2 text-center backdrop-blur-sm">
        {role !== 'top' && (
          <p className="text-[11px] font-bold tracking-wide text-white/90 uppercase">{style.label}</p>
        )}
        <p className="truncate text-sm font-extrabold text-white">
          {player.firstName} {player.lastName}
        </p>
        {!player.stats && role !== 'top' && (
          <p className="text-xs text-white/80">
            {player.statLine ?? `${player.votes} vote${player.votes > 1 ? 's' : ''}`}
          </p>
        )}
      </div>
    </div>
  )
}

/** Horizontal, swipe-to-scroll row of spotlight cards — snaps card-by-card like a native
 * carousel, no library needed since it's plain scroll-snap. */
export function PlayerSpotlightCarousel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-1">
      {children}
    </div>
  )
}
