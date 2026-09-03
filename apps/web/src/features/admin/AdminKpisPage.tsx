import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowDown, ArrowUp, ArrowUpDown, Bell, BellOff, Smartphone, UserX, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'
import { fetchPlayerStats } from '@/features/stats/api'
import type { PlayerStats } from '@/lib/types'
import {
  createSeparationRule,
  deleteSeparationRule,
  fetchAdminKpis,
  fetchSeparationRulesForUser,
  type UserActivityKpi,
} from './api'

const ROLE_LABELS: Record<UserActivityKpi['role'], string> = {
  PLAYER: 'Joueur',
  COACH: 'Coach',
  SUPERADMIN: 'Super-admin',
}

const STATUS_LABELS: Record<UserActivityKpi['status'], string> = {
  ACTIVE: 'Actif',
  PENDING: 'En attente de validation',
}

function MiniHeatmap({ days }: { days: boolean[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {days.map((active, i) => (
        <div
          key={i}
          className={cn('size-3 rounded-sm', active ? 'bg-emerald-500' : 'bg-muted')}
          title={active ? 'Actif' : 'Inactif'}
        />
      ))}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

/** Everything known about one player, admin-only — combines the KPI row already fetched
 * for the table with their stats (fetched once at page level, same source as the "Niveau"
 * column), so opening this costs no extra request. */
function PlayerDetailDialog({
  player,
  stats,
  allPlayers,
  onClose,
}: {
  player: UserActivityKpi
  stats: PlayerStats | undefined
  allPlayers: UserActivityKpi[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [addingRule, setAddingRule] = useState(false)
  const [pickedUserId, setPickedUserId] = useState('')

  const rulesQuery = useQuery({
    queryKey: ['separation-rules', player.userId],
    queryFn: () => fetchSeparationRulesForUser(player.userId),
  })

  const createRuleMutation = useMutation({
    mutationFn: (otherUserId: string) => createSeparationRule(player.userId, otherUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['separation-rules', player.userId] })
      setAddingRule(false)
      setPickedUserId('')
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteSeparationRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['separation-rules', player.userId] }),
  })

  const rules = rulesQuery.data ?? []
  const excludedIds = new Set([player.userId, ...rules.map((r) => r.otherUserId)])
  const candidates = allPlayers.filter((p) => !excludedIds.has(p.userId))

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayerAvatar firstName={player.firstName} lastName={player.lastName} avatarUrl={null} size="sm" />
            {player.firstName} {player.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y">
            <DetailRow label="Email" value={player.email} />
            <DetailRow label="Rôle" value={ROLE_LABELS[player.role]} />
            <DetailRow label="Statut" value={STATUS_LABELS[player.status]} />
            <DetailRow
              label="Compte créé"
              value={format(new Date(player.createdAt), 'd MMM yyyy', { locale: fr })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Activité
            </p>
            <div className="flex flex-col divide-y">
              <DetailRow
                label="Dernière connexion"
                value={
                  player.lastSeenAt
                    ? formatDistanceToNow(new Date(player.lastSeenAt), { locale: fr, addSuffix: true })
                    : 'Jamais connecté'
                }
              />
              <DetailRow label="Connexions au total" value={player.loginCount} />
              <DetailRow label="Jours actifs (total)" value={player.activeDaysAllTime} />
              <DetailRow label="Jours actifs / 7 derniers jours" value={`${player.activeDaysLast7}/7`} />
              <DetailRow label="Jours actifs / 30 derniers jours" value={`${player.activeDaysLast30}/30`} />
              <DetailRow
                label="Appli installée"
                value={
                  player.pwaInstalled
                    ? `Oui${player.pwaInstalledAt ? ` (${format(new Date(player.pwaInstalledAt), 'd MMM yyyy', { locale: fr })})` : ''}`
                    : 'Non'
                }
              />
              <DetailRow
                label="Notifications"
                value={player.notificationsEnabled ? 'Activées' : 'Désactivées'}
              />
            </div>
            <div className="pt-1">
              <MiniHeatmap days={player.last7Days} />
            </div>
          </div>

          {stats && (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Niveau et performance
              </p>
              <div className="flex flex-col divide-y">
                <DetailRow label="Niveau" value={stats.skillScore ?? '— (jamais noté)'} />
                <DetailRow
                  label="Note moyenne"
                  value={stats.averageRating != null ? `${stats.averageRating.toFixed(1)}/10 (${stats.ratingsCount} note${stats.ratingsCount > 1 ? 's' : ''})` : '—'}
                />
                <DetailRow label="Matchs joués" value={stats.matchesPlayed} />
                <DetailRow label="Buts / passes" value={`${stats.goals} / ${stats.assists}`} />
                <DetailRow label="Cartons jaunes / rouges" value={`${stats.yellowCards} / ${stats.redCards}`} />
                <DetailRow label="Homme du match" value={stats.motmCount} />
                <DetailRow label="Patron de la défense" value={stats.patronDefenseCount} />
                {stats.defensiveMatchesStarted > 0 && (
                  <>
                    <DetailRow
                      label="Clean sheets (déf./gardien)"
                      value={`${stats.cleanSheets}/${stats.defensiveMatchesStarted}`}
                    />
                    <DetailRow label="Buts encaissés (déf./gardien)" value={stats.goalsConceded} />
                  </>
                )}
                <DetailRow
                  label="Assiduité entraînements"
                  value={
                    stats.trainingAttendanceRate != null
                      ? `${Math.round(stats.trainingAttendanceRate * 100)}% (${stats.trainingsPresent}/${stats.trainingsResponded})`
                      : '—'
                  }
                />
                <DetailRow label="Série de présence" value={stats.presenceStreak} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Jamais dans la même équipe (entraînements)
            </p>
            {rules.length > 0 && (
              <ul className="flex flex-col gap-1">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      <UserX className="text-muted-foreground size-3.5" />
                      {r.otherUserFirstName} {r.otherUserLastName}
                    </span>
                    <button
                      type="button"
                      disabled={deleteRuleMutation.isPending}
                      onClick={() => deleteRuleMutation.mutate(r.id)}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                      aria-label="Retirer cette règle"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {rules.length === 0 && !addingRule && (
              <p className="text-muted-foreground text-sm">Aucune règle.</p>
            )}
            {addingRule ? (
              <div className="flex items-center gap-1.5">
                <Select value={pickedUserId} onValueChange={setPickedUserId}>
                  <SelectTrigger className="h-8 flex-1 text-sm">
                    <SelectValue placeholder="Choisir un joueur" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.userId} value={c.userId}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={!pickedUserId || createRuleMutation.isPending}
                  onClick={() => createRuleMutation.mutate(pickedUserId)}
                >
                  OK
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setAddingRule(false)
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
                className="h-8 self-start gap-1.5"
                onClick={() => setAddingRule(true)}
              >
                <UserX className="size-3.5" />
                Ajouter une règle
              </Button>
            )}
            {createRuleMutation.isError && (
              <p className="text-destructive text-xs">Échec — réessaie.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type KpiSortKey = 'name' | 'role' | 'level' | 'lastSeen' | 'active7' | 'active30' | 'pwa' | 'notifs'

/** A clickable column header — click sorts by that column (numeric columns default to
 * highest first, name defaults to A→Z), click again on the same column flips direction. */
function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string
  sortKey: KpiSortKey
  active: boolean
  dir: 'asc' | 'desc'
  onSort: (key: KpiSortKey) => void
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'flex items-center gap-1 hover:text-foreground',
          active ? 'text-foreground font-semibold' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  )
}

export function AdminKpisPage() {
  const kpisQuery = useQuery({ queryKey: ['admin', 'kpis'], queryFn: fetchAdminKpis })
  const data = kpisQuery.data

  // Same all-time skillScore TeamBalancingService.generateTeams uses to balance training
  // teams (StatsService.getPlayerStats() with no season filter) — not shown anywhere else
  // in the app (StatsPage only ever uses it to order the roster table, never renders the
  // number), admin-only visibility here is deliberate.
  const statsQuery = useQuery({ queryKey: ['stats', 'players', 'all-time'], queryFn: () => fetchPlayerStats() })
  const skillScoreByUserId = new Map(statsQuery.data?.map((s) => [s.userId, s.skillScore]) ?? [])
  const statsByUserId = new Map(statsQuery.data?.map((s) => [s.userId, s]) ?? [])

  const [selectedPlayer, setSelectedPlayer] = useState<UserActivityKpi | null>(null)

  // Null = the backend's own order (least active first). Once the viewer picks a column,
  // client-side sort takes over — numeric columns default to highest first (a "niveau"
  // sort should surface the strongest players, not the weakest), name defaults A→Z.
  const [sortKey, setSortKey] = useState<KpiSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: KpiSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const sortedPlayers = useMemo(() => {
    const players = data?.players ?? []
    if (!sortKey) return players

    const value = (p: UserActivityKpi): number | string => {
      switch (sortKey) {
        case 'name':
          return `${p.firstName} ${p.lastName}`.toLowerCase()
        case 'role':
          return ROLE_LABELS[p.role]
        case 'level':
          // No score yet sorts as the lowest, not last-alphabetically or NaN — a never-rated
          // player is meaningfully "below" a 0, but shouldn't scatter the sort.
          return skillScoreByUserId.get(p.userId) ?? -1
        case 'lastSeen':
          return p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : -Infinity
        case 'active7':
          return p.activeDaysLast7
        case 'active30':
          return p.activeDaysLast30
        case 'pwa':
          return p.pwaInstalled ? 1 : 0
        case 'notifs':
          return p.notificationsEnabled ? 1 : 0
      }
    }

    const sorted = [...players].sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      return typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number)
    })
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [data?.players, sortKey, sortDir, skillScoreByUserId])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground text-sm">
          Utilisation de l'application par les membres de l'effectif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Actifs cette semaine</CardDescription>
            <CardTitle className="text-2xl">
              {data ? `${data.activeLast7Days}/${data.totalUsers}` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Actifs ce mois</CardDescription>
            <CardTitle className="text-2xl">
              {data ? `${data.activeLast30Days}/${data.totalUsers}` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Comptes au total</CardDescription>
            <CardTitle className="text-2xl">{data?.totalUsers ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Appli installée</CardDescription>
            <CardTitle className="text-2xl">
              {data ? `${data.players.filter((p) => p.pwaInstalled).length}/${data.totalUsers}` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Notifications activées</CardDescription>
            <CardTitle className="text-2xl">
              {data
                ? `${data.players.filter((p) => p.notificationsEnabled).length}/${data.totalUsers}`
                : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activité par joueur</CardTitle>
          <CardDescription>
            {sortKey
              ? "Clique une colonne pour changer le tri, ou une seconde fois pour l'inverser."
              : 'Par défaut, triés par dernière connexion — les moins actifs en premier. Clique une colonne pour trier autrement.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Joueur" sortKey="name" active={sortKey === 'name'} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Rôle" sortKey="role" active={sortKey === 'role'} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Niveau" sortKey="level" active={sortKey === 'level'} dir={sortDir} onSort={toggleSort} />
                <SortableHeader
                  label="Dernière connexion"
                  sortKey="lastSeen"
                  active={sortKey === 'lastSeen'}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <TableHead>7 derniers jours</TableHead>
                <SortableHeader
                  label="Jours actifs / 7"
                  sortKey="active7"
                  active={sortKey === 'active7'}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Jours actifs / 30"
                  sortKey="active30"
                  active={sortKey === 'active30'}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHeader label="Appli" sortKey="pwa" active={sortKey === 'pwa'} dir={sortDir} onSort={toggleSort} />
                <SortableHeader
                  label="Notifs"
                  sortKey="notifs"
                  active={sortKey === 'notifs'}
                  dir={sortDir}
                  onSort={toggleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(p)}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <PlayerAvatar firstName={p.firstName} lastName={p.lastName} avatarUrl={null} size="sm" />
                      <span className="font-medium">
                        {p.firstName} {p.lastName}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[p.role]}</TableCell>
                  <TableCell className="font-medium">
                    {skillScoreByUserId.get(p.userId) ?? '—'}
                  </TableCell>
                  <TableCell>
                    {p.lastSeenAt
                      ? formatDistanceToNow(new Date(p.lastSeenAt), { locale: fr, addSuffix: true })
                      : 'Jamais connecté'}
                  </TableCell>
                  <TableCell>
                    <MiniHeatmap days={p.last7Days} />
                  </TableCell>
                  <TableCell>{p.activeDaysLast7}/7</TableCell>
                  <TableCell>{p.activeDaysLast30}/30</TableCell>
                  <TableCell>
                    {p.pwaInstalled ? (
                      <span
                        className="inline-flex items-center gap-1 text-emerald-600"
                        title="Appli installée"
                      >
                        <Smartphone className="size-3.5" />
                      </span>
                    ) : (
                      <span
                        className="text-muted-foreground inline-flex items-center gap-1"
                        title="Appli non installée"
                      >
                        <Smartphone className="size-3.5 opacity-40" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.notificationsEnabled ? (
                      <span
                        className="inline-flex items-center gap-1 text-emerald-600"
                        title="A activé les notifications"
                      >
                        <Bell className="size-3.5" />
                      </span>
                    ) : (
                      <span
                        className="text-muted-foreground inline-flex items-center gap-1"
                        title="N'a pas activé les notifications"
                      >
                        <BellOff className="size-3.5" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedPlayer && (
        <PlayerDetailDialog
          player={selectedPlayer}
          stats={statsByUserId.get(selectedPlayer.userId)}
          allPlayers={data?.players ?? []}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
