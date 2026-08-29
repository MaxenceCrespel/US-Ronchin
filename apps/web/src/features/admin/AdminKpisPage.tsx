import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Bell, BellOff, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'
import { fetchPlayerStats } from '@/features/stats/api'
import type { PlayerStats } from '@/lib/types'
import { fetchAdminKpis, type UserActivityKpi } from './api'

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
  onClose,
}: {
  player: UserActivityKpi
  stats: PlayerStats | undefined
  onClose: () => void
}) {
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
        </div>
      </DialogContent>
    </Dialog>
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
          <CardDescription>Triés par dernière connexion — les moins actifs en premier.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joueur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead>7 derniers jours</TableHead>
                <TableHead>Jours actifs / 7</TableHead>
                <TableHead>Jours actifs / 30</TableHead>
                <TableHead>Appli</TableHead>
                <TableHead>Notifs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.players.map((p) => (
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
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
