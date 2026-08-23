import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'
import { fetchAdminKpis, type UserActivityKpi } from './api'

const ROLE_LABELS: Record<UserActivityKpi['role'], string> = {
  PLAYER: 'Joueur',
  COACH: 'Coach',
  SUPERADMIN: 'Super-admin',
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

export function AdminKpisPage() {
  const kpisQuery = useQuery({ queryKey: ['admin', 'kpis'], queryFn: fetchAdminKpis })
  const data = kpisQuery.data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground text-sm">
          Utilisation de l'application par les membres de l'effectif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <TableHead>Dernière connexion</TableHead>
                <TableHead>7 derniers jours</TableHead>
                <TableHead>Jours actifs / 7</TableHead>
                <TableHead>Jours actifs / 30</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.players.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PlayerAvatar firstName={p.firstName} lastName={p.lastName} avatarUrl={null} size="sm" />
                      <span className="font-medium">
                        {p.firstName} {p.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[p.role]}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
