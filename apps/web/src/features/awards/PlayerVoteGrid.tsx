import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'

export interface VotablePlayer {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}

/** A tap-to-pick grid of player cards — the replacement for the "Choisir un joueur"
 * dropdown in the season-awards vote. One card per roster player (avatar + name); the
 * selected one gets a gold ring and a check. A search field appears only once the roster
 * is big enough that scanning the grid gets tedious. */
export function PlayerVoteGrid({
  players,
  selectedId,
  onSelect,
}: {
  players: VotablePlayer[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const showSearch = players.length > 12

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
  }, [players, query])

  return (
    <div className="flex w-full flex-col gap-3">
      {showSearch && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un joueur"
            className="bg-white/5 pl-9 text-white placeholder:text-white/40"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {filtered.map((p) => {
          const selected = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all',
                selected
                  ? 'border-club-gold bg-club-gold/10 shadow-[0_0_0_1px_var(--color-club-gold)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
              )}
            >
              {selected && (
                <span className="bg-club-gold absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-black">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
              <PlayerAvatar
                avatarUrl={p.avatarUrl}
                firstName={p.firstName}
                lastName={p.lastName}
                size="lg"
                className={cn(selected && 'ring-club-gold ring-2 ring-offset-2 ring-offset-transparent')}
              />
              <span className="text-xs leading-tight font-medium text-white">
                {p.firstName} {p.lastName}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-white/50">Aucun joueur trouvé.</p>
      )}
    </div>
  )
}
