import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { fetchStandings, fetchStandingsLogs } from './api'

// Read-only status now — the sync itself fires automatically (saving the FFF URL in
// Paramètres, and every Monday via fff-weekly-sync.scheduler.ts), so there's nothing left to
// manually trigger from here.
export function StandingsCard() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)

  const standingsQuery = useQuery({ queryKey: ['standings'], queryFn: fetchStandings })
  const logsQuery = useQuery({
    queryKey: ['standings-logs'],
    queryFn: () => fetchStandingsLogs(1),
    enabled: isCoach,
  })

  const lastLog = logsQuery.data?.[0]
  const standings = standingsQuery.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="text-club-gold size-4" />
          Classement du championnat
        </CardTitle>
        {isCoach && lastLog && (
          <CardDescription className="text-xs">
            Dernière synchro : {new Date(lastLog.runAt).toLocaleString('fr-FR')} —{' '}
            {lastLog.status === 'SUCCESS'
              ? `${lastLog.teamsFound} équipes`
              : `échec (${lastLog.errorMessage})`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {standings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Pas encore de classement synchronisé.
          </p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Équipe</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead className="text-right">J</TableHead>
                  <TableHead className="text-right">G</TableHead>
                  <TableHead className="text-right">N</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">Diff.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((s) => (
                  <TableRow key={s.id} className={cn(s.isUs && 'bg-club-blue/5 font-semibold')}>
                    <TableCell>{s.rank}</TableCell>
                    <TableCell>{s.teamName}</TableCell>
                    <TableCell className="text-right">{s.points}</TableCell>
                    <TableCell className="text-right">{s.played}</TableCell>
                    <TableCell className="text-right">{s.won}</TableCell>
                    <TableCell className="text-right">{s.drawn}</TableCell>
                    <TableCell className="text-right">{s.lost}</TableCell>
                    <TableCell className="text-right">
                      {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
