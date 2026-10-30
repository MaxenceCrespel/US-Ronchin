import { useQuery } from '@tanstack/react-query'
import { fetchTeamLevels, type TeamLevels } from './teams-api'

const format = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/** Levels of a session's generated teams, for the coach. Refetched whenever the team
 * composition query is invalidated (same ['teams', sessionId] prefix). */
export function useTeamLevels(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['teams', sessionId, 'levels'],
    queryFn: () => fetchTeamLevels(sessionId),
    enabled,
  })
}

/** One team's mean level, total and how many players it is based on. */
export function TeamLevelLine({ levels, teamIndex }: { levels?: TeamLevels; teamIndex: number }) {
  const team = levels?.teams.find((t) => t.teamIndex === teamIndex)
  if (!team) return null
  return (
    <p
      className="mb-1.5 text-sm font-semibold tabular-nums"
      data-testid={`team-level-${teamIndex}`}
      title={`Total ${format(team.total)} · ${team.playerCount} joueurs${team.estimated > 0 ? ` dont ${team.estimated} estimé${team.estimated > 1 ? 's' : ''}` : ''}`}
    >
      Niveau {format(team.average ?? 0)}
    </p>
  )
}

/** Gap between the two teams' means — the one number that says whether the split is fair. */
export function TeamLevelGap({ levels }: { levels?: TeamLevels }) {
  const means = levels?.teams.map((t) => t.average).filter((v): v is number => v !== null) ?? []
  if (means.length < 2) return null
  const gap = Math.max(...means) - Math.min(...means)
  return (
    <p className="text-muted-foreground text-xs tabular-nums" data-testid="team-level-gap">
      Écart : <strong>{format(gap)}</strong> pt{gap >= 2 ? 's' : ''}
    </p>
  )
}

/** A player's level next to the name; "~" marks an estimate (guest, walk-in, no record yet)
 * counted at the session mean. */
export function PlayerLevelChip({ levels, assignmentId }: { levels?: TeamLevels; assignmentId: string }) {
  const entry = levels?.assignments[assignmentId]
  if (!entry) return null
  return (
    <span
      className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-white/15"
      title={entry.estimated ? 'Niveau estimé (moyenne de la séance)' : "Niveau d'entraînement"}
    >
      {entry.estimated ? '~' : ''}{format(entry.level)}
    </span>
  )
}
