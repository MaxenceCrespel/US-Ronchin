import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { BadgeCategory, BadgeHolderGroup } from '@/lib/types'
import { CATEGORY_LABELS, CATEGORY_ORDER, RARITY_LABELS, RARITY_RING, RARITY_TEXT } from '@/features/badges/BadgesGrid'
import { fetchBadgeHolders, grantBadge, revokeBadge, revokeBadgeFromEveryone } from '@/features/badges/api'
import { fetchPlayers } from '@/features/players/api'

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
 * player-facing grid — except opening one lists WHO holds it instead of how to earn it,
 * with a manual attribuer/retirer override for correcting a wrongly-fired badge or handing
 * out a one-off exceptional award. */
export function BadgeHoldersPanel() {
  const queryClient = useQueryClient()
  const holdersQuery = useQuery({ queryKey: ['admin', 'badge-holders'], queryFn: fetchBadgeHolders })
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })
  // Key, not the object itself — so once a grant/revoke invalidates the query, the dialog
  // re-renders against the freshly-fetched holder list instead of a stale snapshot.
  const [activeBadgeKey, setActiveBadgeKey] = useState<string | null>(null)
  const [addingHolder, setAddingHolder] = useState(false)
  const [pickedUserId, setPickedUserId] = useState('')
  const [confirmingRevoke, setConfirmingRevoke] = useState<{
    userId: string
    firstName: string
    lastName: string
  } | null>(null)
  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false)

  const groups = holdersQuery.data ?? []
  const activeBadge = groups.find((g) => g.key === activeBadgeKey) ?? null
  const totalHolders = groups.reduce((sum, g) => sum + g.holders.length, 0)

  const byCategory = useMemo(() => {
    return CATEGORY_ORDER.map((category: BadgeCategory) => ({
      category,
      groups: groups.filter((g) => g.category === category),
    })).filter((c) => c.groups.length > 0)
  }, [groups])

  const grantMutation = useMutation({
    mutationFn: (userId: string) => grantBadge(activeBadgeKey!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'badge-holders'] })
      setAddingHolder(false)
      setPickedUserId('')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeBadge(activeBadgeKey!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'badge-holders'] })
      setConfirmingRevoke(null)
    },
  })

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeBadgeFromEveryone(activeBadgeKey!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'badge-holders'] })
      setConfirmingRevokeAll(false)
    },
  })

  const candidates = (playersQuery.data ?? []).filter(
    (p) => !activeBadge?.holders.some((h) => h.userId === p.id),
  )

  function closeDialog() {
    setActiveBadgeKey(null)
    setAddingHolder(false)
    setPickedUserId('')
  }

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
                <BadgeMedal key={group.key} group={group} onOpen={() => setActiveBadgeKey(group.key)} />
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={activeBadge !== null} onOpenChange={(open) => !open && closeDialog()}>
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
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {holder.count > 1 ? `×${holder.count} — ` : ''}
                      {formatEarnedDate(holder.earnedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmingRevoke(holder)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      aria-label={`Retirer ce badge à ${holder.firstName} ${holder.lastName}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground py-2 text-center text-xs">
                🔒 Personne ne l'a encore obtenu
              </p>
            )}
          </div>

          {activeBadge && activeBadge.holders.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive h-7 gap-1.5 self-center text-xs"
              onClick={() => setConfirmingRevokeAll(true)}
            >
              <Trash2 className="size-3.5" />
              Retirer à tout le monde
            </Button>
          )}

          <div className="flex flex-col gap-1.5 pt-2">
            {addingHolder ? (
              <div className="flex items-center gap-1.5">
                <Select value={pickedUserId} onValueChange={setPickedUserId}>
                  <SelectTrigger className="h-8 flex-1 text-sm">
                    <SelectValue placeholder="Choisir un joueur" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={!pickedUserId || grantMutation.isPending}
                  onClick={() => grantMutation.mutate(pickedUserId)}
                >
                  OK
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setAddingHolder(false)
                    setPickedUserId('')
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 self-center gap-1.5"
                onClick={() => setAddingHolder(true)}
              >
                <UserPlus className="size-3.5" />
                Attribuer manuellement
              </Button>
            )}
            {(grantMutation.isError || revokeMutation.isError || revokeAllMutation.isError) && (
              <p className="text-destructive text-center text-xs">Échec — réessaie.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingRevoke !== null}
        onOpenChange={(open) => !open && setConfirmingRevoke(null)}
        title="Retirer ce badge ?"
        description={
          confirmingRevoke
            ? `${confirmingRevoke.firstName} ${confirmingRevoke.lastName} ne l'aura plus dans son profil.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
        isPending={revokeMutation.isPending}
        onConfirm={() => confirmingRevoke && revokeMutation.mutate(confirmingRevoke.userId)}
      />

      <ConfirmDialog
        open={confirmingRevokeAll}
        onOpenChange={setConfirmingRevokeAll}
        title="Retirer ce badge à tout le monde ?"
        description={
          activeBadge
            ? `Retire « ${activeBadge.title} » à ses ${activeBadge.holders.length} détenteur${activeBadge.holders.length > 1 ? 's' : ''} actuels — pour corriger un badge qui s'est déclenché à tort pour tout le monde. Cette action ne peut pas être annulée.`
            : undefined
        }
        confirmLabel="Retirer à tout le monde"
        destructive
        isPending={revokeAllMutation.isPending}
        onConfirm={() => revokeAllMutation.mutate()}
      />
    </Card>
  )
}
