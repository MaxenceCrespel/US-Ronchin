import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { fetchStandings, fetchStandingsLogs, syncStandings } from './api'

export function StandingsCard() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)
  const queryClient = useQueryClient()

  const standingsQuery = useQuery({ queryKey: ['standings'], queryFn: fetchStandings })
  const logsQuery = useQuery({
    queryKey: ['standings-logs'],
    queryFn: () => fetchStandingsLogs(1),
    enabled: isCoach,
  })

  const syncMutation = useMutation({
    mutationFn: syncStandings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standings'] })
      queryClient.invalidateQueries({ queryKey: ['standings-logs'] })
    },
  })

  const lastLog = logsQuery.data?.[0]
  const standings = standingsQuery.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Trophy className="text-club-gold size-4" />
            Classement du championnat
          </span>
          {isCoach && (
            <Button
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw className={syncMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
              Synchroniser
            </Button>
          )}
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
