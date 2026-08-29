import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Crown, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { getSeasonBounds, isInSeason } from '@/lib/season'
import type { PlayerStats } from '@/lib/types'
import { isRosterPlayer } from '@/lib/roster'
import { fetchAvailableSeasons, fetchPlayerStats, fetchTeamStats } from './api'
import { MyStatsCard } from './MyStatsCard'
import { MonthlyChallengesCard } from './MonthlyChallengesCard'
import { StandingsCard } from '@/features/standings/StandingsCard'
import { AwardsSection } from '@/features/awards/AwardsSection'
import { fetchMatches } from '@/features/matches/api'
import { fetchPlayers } from '@/features/players/api'

const CAREER = 'career'

/** Trophées de fin de saison : visibles uniquement du 1er au 15 juin. */
function isAwardsSeasonWindow(date = new Date()) {
  return date.getMonth() === 5 && date.getDate() <= 15
}

const MEDAL_STYLES = [
  'bg-club-gold text-white', // 1st
  'bg-slate-300 text-slate-800', // 2nd
  'bg-amber-700 text-white', // 3rd
]

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        MEDAL_STYLES[rank] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {rank + 1}
    </span>
  )
}

function Leaderboard({ title, players, valueKey, valueLabel }: {
  title: string
  players: PlayerStats[]
  valueKey: 'goals' | 'assists'
  valueLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-muted-foreground text-sm">Pas encore de données.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {players.map((p, index) => (
              <li key={p.userId} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2.5">
                  <RankBadge rank={index} />
                  {p.firstName} {p.lastName}
                </span>
                <Badge variant="secondary">
                  {p[valueKey]} {valueLabel}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SeasonRecordCard({ season }: { season: string }) {
  const matchesQuery = useQuery({ queryKey: ['matches'], queryFn: fetchMatches })
  const bounds = season !== CAREER ? getSeasonBounds(season) : null
  const played = (matchesQuery.data ?? []).filter(
    (m) => m.status === 'PLAYED' && (!bounds || isInSeason(m.date, bounds)),
  )

  let won = 0
  let drawn = 0
  let lost = 0
  for (const m of played) {
    const ourScore = m.homeAway === 'HOME' ? m.scoreHome : m.scoreAway
    const theirScore = m.homeAway === 'HOME' ? m.scoreAway : m.scoreHome
    if (ourScore == null || theirScore == null) continue
    if (ourScore > theirScore) won += 1
    else if (ourScore === theirScore) drawn += 1
    else lost += 1
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bilan de la saison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-emerald-600">{won}</p>
            <p className="text-muted-foreground text-xs">Victoires</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{drawn}</p>
            <p className="text-muted-foreground text-xs">Nuls</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-rose-600">{lost}</p>
            <p className="text-muted-foreground text-xs">Défaites</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type RosterSortKey =
  | 'name'
  | 'matchesPlayed'
  | 'goals'
  | 'assists'
  | 'motmCount'
  | 'patronDefenseCount'
  | 'yellowCards'
  | 'redCards'
  | 'averageRating'
  | 'trainingAttendanceRate'
  | 'skillScore'

const ROSTER_SORT_VALUE: Record<RosterSortKey, (p: PlayerStats) => number | string> = {
  name: (p) => `${p.lastName} ${p.firstName}`.toLowerCase(),
  matchesPlayed: (p) => p.matchesPlayed,
  goals: (p) => p.goals,
  assists: (p) => p.assists,
  motmCount: (p) => p.motmCount,
  patronDefenseCount: (p) => p.patronDefenseCount,
  yellowCards: (p) => p.yellowCards,
  redCards: (p) => p.redCards,
  averageRating: (p) => p.averageRating ?? -1,
  trainingAttendanceRate: (p) => p.trainingAttendanceRate ?? -1,
  skillScore: (p) => p.skillScore ?? -1,
}

// Text sorts alphabetically first by default; every numeric stat sorts highest-first —
// that's the order you'd actually want when scanning a column of goals or cards.
const ROSTER_SORT_DEFAULT_DIR: Record<RosterSortKey, 'asc' | 'desc'> = {
  name: 'asc',
  matchesPlayed: 'desc',
  goals: 'desc',
  assists: 'desc',
  motmCount: 'desc',
  patronDefenseCount: 'desc',
  yellowCards: 'desc',
  redCards: 'desc',
  averageRating: 'desc',
  trainingAttendanceRate: 'desc',
  skillScore: 'desc',
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'right',
  stickyLeft = false,
}: {
  label: string
  sortKey: RosterSortKey
  activeKey: RosterSortKey
  dir: 'asc' | 'desc'
  onSort: (key: RosterSortKey) => void
  align?: 'left' | 'right'
  stickyLeft?: boolean
}) {
  const active = sortKey === activeKey
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', stickyLeft && 'bg-card sticky left-0 z-10')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'hover:text-foreground inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground font-semibold',
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  )
}

function RosterStatsTable({ season }: { season: string }) {
  const playerStatsQuery = useQuery({
    queryKey: ['stats', 'players', season],
    queryFn: () => fetchPlayerStats(season),
  })
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })

  const [sortKey, setSortKey] = useState<RosterSortKey>('skillScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: RosterSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(ROSTER_SORT_DEFAULT_DIR[key])
    }
  }

  const playerIds = new Set(
    (playersQuery.data ?? []).filter((p) => isRosterPlayer(p)).map((p) => p.id),
  )
  const roster = (playerStatsQuery.data ?? [])
    .filter((p) => playerIds.has(p.userId))
    .sort((a, b) => {
      const va = ROSTER_SORT_VALUE[sortKey](a)
      const vb = ROSTER_SORT_VALUE[sortKey](b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })

  return (
    <Card data-tour="stats-roster-table">
      <CardHeader>
        <CardTitle className="text-base">Récapitulatif de l'effectif</CardTitle>
      </CardHeader>
      <CardContent>
        {roster.length === 0 ? (
          <p className="text-muted-foreground text-sm">Pas encore de données.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Joueur" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="left" stickyLeft />
                  <SortableHead label="MJ" sortKey="matchesPlayed" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="Buts" sortKey="goals" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="Passes D." sortKey="assists" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="HDM" sortKey="motmCount" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="Patron" sortKey="patronDefenseCount" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="🟨" sortKey="yellowCards" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="🟥" sortKey="redCards" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="Note moy." sortKey="averageRating" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableHead label="Assiduité" sortKey="trainingAttendanceRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((p) => (
                  <TableRow key={p.userId}>
                    <TableCell className="bg-card sticky left-0 z-10 text-xs font-medium">
                      {p.firstName} {p.lastName}
                    </TableCell>
                    <TableCell className="text-right">{p.matchesPlayed}</TableCell>
                    <TableCell className="text-right">{p.goals}</TableCell>
                    <TableCell className="text-right">{p.assists}</TableCell>
                    <TableCell className="text-right">
                      {p.motmCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Crown className="text-club-gold size-3.5" />
                          {p.motmCount}
                        </span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.patronDefenseCount > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="text-club-blue size-3.5" />
                          {p.patronDefenseCount}
                        </span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.yellowCards}</TableCell>
                    <TableCell className="text-right">{p.redCards}</TableCell>
                    <TableCell className="text-right">
                      {p.averageRating != null ? `${p.averageRating.toFixed(1)}/10` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.trainingAttendanceRate != null
                        ? `${Math.round(p.trainingAttendanceRate * 100)}%`
                        : '—'}
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

export function StatsPage() {
  const user = useAuthStore((s) => s.user)
  const seasonsQuery = useQuery({ queryKey: ['stats', 'seasons'], queryFn: fetchAvailableSeasons })
  const [season, setSeason] = useState<string | null>(null)
  const activeSeason = season ?? seasonsQuery.data?.current ?? CAREER

  const playerStatsQuery = useQuery({
    queryKey: ['stats', 'players', activeSeason],
    queryFn: () => fetchPlayerStats(activeSeason),
    enabled: !!seasonsQuery.data,
  })
  const teamStatsQuery = useQuery({
    queryKey: ['stats', 'team', activeSeason],
    queryFn: () => fetchTeamStats(activeSeason),
    enabled: !!seasonsQuery.data,
  })

  const myStats = playerStatsQuery.data?.find((p) => p.userId === user?.id)

  return (
    <div className="flex flex-col gap-6" data-tour="stats-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Statistiques</h1>
        {seasonsQuery.data && (
          <Select value={activeSeason} onValueChange={setSeason}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seasonsQuery.data.seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} {s === seasonsQuery.data!.current ? '(en cours)' : ''}
                </SelectItem>
              ))}
              <SelectItem value={CAREER}>Carrière (tout confondu)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {myStats && <MyStatsCard stats={myStats} />}

      <MonthlyChallengesCard />

      <RosterStatsTable season={activeSeason} />

      <div>
        <h2 className="mb-3 text-lg font-medium">Bilan de saison</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StandingsCard />
          <SeasonRecordCard season={activeSeason} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Statistiques de l'équipe</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Leaderboard
            title="Meilleurs buteurs"
            players={teamStatsQuery.data?.topScorers ?? []}
            valueKey="goals"
            valueLabel="buts"
          />
          <Leaderboard
            title="Meilleurs passeurs"
            players={teamStatsQuery.data?.topAssists ?? []}
            valueKey="assists"
            valueLabel="passes"
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Joueurs les plus décisifs</CardTitle>
            </CardHeader>
            <CardContent>
              {(teamStatsQuery.data?.mostDecisive.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm">Pas encore de données.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {teamStatsQuery.data?.mostDecisive.map((p, index) => (
                    <li key={p.userId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2.5">
                        <RankBadge rank={index} />
                        {p.firstName} {p.lastName}
                      </span>
                      <Badge variant="secondary">{p.goals + p.assists} pts</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meilleures connexions (buteur / passeur)</CardTitle>
        </CardHeader>
        <CardContent>
          {(teamStatsQuery.data?.bestDuos.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">Pas encore de données.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passeur</TableHead>
                  <TableHead>Buteur</TableHead>
                  <TableHead>Buts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamStatsQuery.data?.bestDuos.map((duo) => (
                  <TableRow key={`${duo.scorerId}-${duo.assistId}`}>
                    <TableCell>{duo.assistName}</TableCell>
                    <TableCell>{duo.scorerName}</TableCell>
                    <TableCell>{duo.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAwardsSeasonWindow() && <AwardsSection />}
    </div>
  )
}
