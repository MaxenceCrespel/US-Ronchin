import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_VARIANTS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { PlayerTrainingHistoryEntry } from '@/lib/types'
import { fetchPlayerTrainingHistory } from './api'

const TEAM_LABELS = ['Équipe Bleue', 'Équipe Rouge']

function formatSessionDate(date: string) {
  return format(new Date(`${date}T00:00:00`), 'd MMM yyyy', { locale: fr })
}

/** "Mardi 15 septembre 2026" — the full weekday the select picker shows, since picking a
 * session by "which day of the week" is how a coach actually remembers it ("c'était le mardi
 * d'avant les vacances"), not by a bare "15 sept." the table rows use elsewhere. */
function formatFullSessionDate(date: string) {
  const text = format(new Date(`${date}T00:00:00`), 'EEEE d MMMM yyyy', { locale: fr })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function DeclaredBadge({ entry }: { entry: PlayerTrainingHistoryEntry }) {
  return entry.declaredStatus ? (
    <Badge variant={ATTENDANCE_STATUS_VARIANTS[entry.declaredStatus]}>
      {ATTENDANCE_STATUS_LABELS[entry.declaredStatus]}
    </Badge>
  ) : (
    <span className="text-muted-foreground text-xs">—</span>
  )
}

function ActualBadge({ entry }: { entry: PlayerTrainingHistoryEntry }) {
  return entry.actualStatus ? (
    <Badge
      variant={ATTENDANCE_STATUS_VARIANTS[entry.actualStatus]}
      className={cn(
        // Flags a discrepancy between the declaration and the real pointage — exactly the
        // kind of thing a points dispute turns out to hinge on.
        entry.declaredStatus && entry.actualStatus !== entry.declaredStatus && 'ring-1 ring-amber-500',
      )}
    >
      {ATTENDANCE_STATUS_LABELS[entry.actualStatus]}
    </Badge>
  ) : (
    <span className="text-muted-foreground text-xs">Pas encore pointé</span>
  )
}

/** Session-by-session breakdown for one player — declared status vs. the coach's real
 * pointage, which team, the score, and the points that earned — for untangling a "mes
 * points sont faux" dispute without a one-off SQL query each time. Shared between the
 * admin dashboard (coach/admin looking up anyone) and a player's own stats page (looking
 * up themselves) — the backend enforces who's allowed to see which userId, this component
 * doesn't need to know which case it's in.
 *
 * Two layouts for the same data rather than one wide table that only scrolls sideways on a
 * phone: a real table from `sm` up, one compact card per session below it — `hidden`/
 * `sm:hidden` toggles which one is in the DOM per breakpoint (both render, only one shows,
 * so there's no layout-dependent fetch logic to keep in sync). */
export function PlayerTrainingHistoryPanel({
  userId,
  hideUpcoming = false,
  pageSize,
}: {
  userId: string
  /** A player's own "history" isn't interested in what's still to come — only the admin/
   * coach dispute-resolution view (untangling a wrong team/score) needs the full list,
   * upcoming sessions included. */
  hideUpcoming?: boolean
  /** Shows this many most-recent entries by default; anything older is reachable one at a
   * time through a "choisir un entraînement" select (labelled by full weekday + date) rather
   * than a "Voir plus" that dumps the rest of the season at once. */
  pageSize?: number
}) {
  const historyQuery = useQuery({
    queryKey: ['training-history', userId],
    queryFn: () => fetchPlayerTrainingHistory(userId),
  })
  // Older sessions picked one at a time via the select below, added to what's shown without
  // replacing the default "most recent" set.
  const [extraSessionIds, setExtraSessionIds] = useState<Set<string>>(new Set())

  // "en-CA" gives a plain YYYY-MM-DD in the browser's own local time — the club plays in
  // one timezone (Europe/Paris) and this only ever runs in a player's own browser there, so
  // there's no UTC-vs-Paris mismatch to guard against the way the backend has to.
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const history = useMemo(() => {
    const all = historyQuery.data ?? []
    return hideUpcoming ? all.filter((entry) => entry.date <= today) : all
  }, [historyQuery.data, hideUpcoming, today])
  const visibleHistory =
    pageSize === undefined
      ? history
      : history.filter((entry, i) => i < pageSize || extraSessionIds.has(entry.sessionId))
  const olderOptions = pageSize === undefined ? [] : history.slice(pageSize).filter((entry) => !extraSessionIds.has(entry.sessionId))

  if (historyQuery.isLoading) {
    return <p className="text-muted-foreground text-sm">Chargement…</p>
  }
  if (historyQuery.isSuccess && history.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun entraînement enregistré.</p>
  }
  if (history.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Déclaré</TableHead>
              <TableHead>Pointage réel</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleHistory.map((entry) => (
              <TableRow key={entry.sessionId}>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatSessionDate(entry.date)}
                  {entry.cancelled && <span className="text-muted-foreground ml-1 text-xs">(annulé)</span>}
                </TableCell>
                <TableCell>
                  <DeclaredBadge entry={entry} />
                </TableCell>
                <TableCell>
                  <ActualBadge entry={entry} />
                </TableCell>
                <TableCell className="text-sm">
                  {entry.teamIndex != null ? (TEAM_LABELS[entry.teamIndex] ?? `Équipe ${entry.teamIndex + 1}`) : '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {entry.scoreTeam0 != null && entry.scoreTeam1 != null
                    ? `${entry.scoreTeam0} - ${entry.scoreTeam1}`
                    : '—'}
                </TableCell>
                <TableCell className="text-sm font-medium">{entry.points ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:hidden">
        {visibleHistory.map((entry) => (
          <div key={entry.sessionId} className="flex flex-col gap-1.5 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {formatSessionDate(entry.date)}
                {entry.cancelled && <span className="text-muted-foreground ml-1 text-xs">(annulé)</span>}
              </span>
              {entry.points != null && <span className="text-sm font-bold">{entry.points} pt{entry.points > 1 ? 's' : ''}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <DeclaredBadge entry={entry} />
              <span className="text-muted-foreground text-xs">déclaré</span>
              <span className="text-muted-foreground mx-0.5">·</span>
              <ActualBadge entry={entry} />
              <span className="text-muted-foreground text-xs">réel</span>
            </div>
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>{entry.teamIndex != null ? (TEAM_LABELS[entry.teamIndex] ?? `Équipe ${entry.teamIndex + 1}`) : 'Pas d\'équipe'}</span>
              <span>
                {entry.scoreTeam0 != null && entry.scoreTeam1 != null
                  ? `${entry.scoreTeam0} - ${entry.scoreTeam1}`
                  : 'Pas encore scoré'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {olderOptions.length > 0 && (
        <Select
          value=""
          onValueChange={(sessionId) =>
            setExtraSessionIds((ids) => new Set(ids).add(sessionId))
          }
        >
          <SelectTrigger aria-label="Choisir un entraînement" className="w-full">
            <SelectValue placeholder="Choisir un entraînement plus ancien…" />
          </SelectTrigger>
          <SelectContent>
            {olderOptions.map((entry) => (
              <SelectItem key={entry.sessionId} value={entry.sessionId}>
                {formatFullSessionDate(entry.date)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
