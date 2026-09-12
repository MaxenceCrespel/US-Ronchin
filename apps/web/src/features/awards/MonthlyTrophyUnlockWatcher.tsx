import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { useCeremonyGateStore } from '@/lib/ceremony-gate'
import { isRosterPlayer } from '@/lib/roster'
import {
  hasNeverSeenMonthlyTrophies,
  loadSeenMonthlyTrophyIds,
  monthlyTrophyId,
  saveSeenMonthlyTrophyIds,
} from '@/lib/monthly-trophy-seen'
import { monthLabelDisplay } from '@/lib/month-label'
import { fetchLastAttendanceTrophyWinner, fetchLastTrainingChampionWinner } from '@/features/stats/api'
import { fetchMonthlyAward } from './api'
import { MonthlyTrophyReveal, type MonthlyTrophyWin } from './MonthlyTrophyReveal'

const POLL_INTERVAL_MS = 60_000

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Ties beyond two names would turn one line into a paragraph — past that, name the first
 * and count the rest instead of listing everyone. */
function namesLine(names: string[]): string {
  if (names.length <= 2) return names.join(' et ')
  return `${names[0]} et ${names.length - 1} autres`
}

function buildWin(params: {
  id: string
  categoryKey: string
  label: string
  month: string
  viewerId: string
  viewerFirstName: string
  winners: { userId: string; firstName: string; lastName: string }[]
}): MonthlyTrophyWin {
  const { id, categoryKey, label, month, viewerId, viewerFirstName, winners } = params
  const isViewerWinner = winners.some((w) => w.userId === viewerId)
  const headline = isViewerWinner
    ? `Félicitations ${viewerFirstName} !`
    : `Félicitations ${namesLine(winners.map((w) => `${w.firstName} ${w.lastName}`))} !`
  return {
    id,
    categoryKey,
    month,
    label,
    period: monthLabelDisplay(month).toUpperCase(),
    headline,
    subtitle: `${label} — ${capitalize(monthLabelDisplay(month))}`,
    showBetterLuckNote: !isViewerWinner,
  }
}

/** Mounted once at the app root, alongside MatchTrophyUnlockWatcher — the moment a monthly
 * category closes (voted "Joueur du mois", or the auto-computed "Assidu du mois"/"Vainqueur
 * d'entraînement" — see stats.service.ts), it takes over the screen once for every roster
 * player (not just the winner — see MonthlyTrophyReveal's own doc comment for why), the next
 * time each of them is actually using the app. Shares the season/monthly/match priority gate
 * with the season ceremony and MatchTrophyUnlockWatcher (see ceremony-gate.ts). */
export function MonthlyTrophyUnlockWatcher() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)
  const [queue, setQueue] = useState<MonthlyTrophyWin[]>([])

  // Only roster players are part of the monthly vote/stats at all — a non-playing coach has
  // nothing to be told about here.
  const eligible = !!user && isRosterPlayer(user) && !tourActive
  const monthlyQuery = useQuery({
    queryKey: ['award-monthly'],
    queryFn: fetchMonthlyAward,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const attendanceWinnerQuery = useQuery({
    queryKey: ['last-attendance-trophy-winner'],
    queryFn: fetchLastAttendanceTrophyWinner,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const trainingChampionWinnerQuery = useQuery({
    queryKey: ['last-training-champion-winner'],
    queryFn: fetchLastTrainingChampionWinner,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  const dataReady = !!monthlyQuery.data && attendanceWinnerQuery.isSuccess && trainingChampionWinnerQuery.isSuccess

  useEffect(() => {
    if (!user || !dataReady || tourActive) return

    const lastClosedMonth = monthlyQuery.data!.history[0]?.season ?? null
    const votedWins: MonthlyTrophyWin[] = lastClosedMonth
      ? (monthlyQuery.data!.history ?? [])
          .filter((c) => c.season === lastClosedMonth && c.results && c.results.length > 0)
          .map((c) =>
            buildWin({
              id: `${c.key}:${c.season}`,
              categoryKey: c.key,
              label: c.title,
              month: c.season!,
              viewerId: user.id,
              viewerFirstName: user.firstName,
              winners: c.results!,
            }),
          )
      : []
    const attendanceWin = attendanceWinnerQuery.data
      ? [
          buildWin({
            id: `attendance_month:${attendanceWinnerQuery.data.month}`,
            categoryKey: 'attendance_month',
            label: 'Assidu du mois',
            month: attendanceWinnerQuery.data.month,
            viewerId: user.id,
            viewerFirstName: user.firstName,
            winners: attendanceWinnerQuery.data.winners,
          }),
        ]
      : []
    const trainingChampionWin = trainingChampionWinnerQuery.data
      ? [
          buildWin({
            id: `training_champion_month:${trainingChampionWinnerQuery.data.month}`,
            categoryKey: 'training_champion_month',
            label: "Vainqueur d'entraînement",
            month: trainingChampionWinnerQuery.data.month,
            viewerId: user.id,
            viewerFirstName: user.firstName,
            winners: trainingChampionWinnerQuery.data.winners,
          }),
        ]
      : []

    const allWins = [...votedWins, ...attendanceWin, ...trainingChampionWin]

    // Only skip the diff when this device has never recorded a monthly-trophy state for this
    // user — every other load (including page reloads) compares against the persisted "seen"
    // set, or a newly-closed result gets silently swallowed on the next refresh instead of
    // being shown.
    if (hasNeverSeenMonthlyTrophies(user.id)) {
      saveSeenMonthlyTrophyIds(user.id, new Set(allWins.map(monthlyTrophyId)))
      return
    }

    const seen = loadSeenMonthlyTrophyIds(user.id)
    const unseen = allWins.filter((w) => !seen.has(monthlyTrophyId(w)))
    if (unseen.length > 0) {
      saveSeenMonthlyTrophyIds(user.id, new Set(allWins.map(monthlyTrophyId)))
      setQueue((prev) => [...prev, ...unseen])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, user, tourActive])

  // Season outranks this; this outranks a personal match trophy — see ceremony-gate.ts. Only
  // actually renders once this watcher successfully holds the gate; `gateActive` is watched
  // so a claim is retried the moment the gate frees up, but never released-then-reclaimed on
  // every render once already held (that would toggle back and forth forever).
  const gateActive = useCeremonyGateStore((s) => s.active)
  const claimGate = useCeremonyGateStore((s) => s.claim)
  const releaseGate = useCeremonyGateStore((s) => s.release)
  const hasQueue = queue.length > 0
  const [holdsGate, setHoldsGate] = useState(false)
  useEffect(() => {
    if (!hasQueue) return
    if (holdsGate) {
      if (gateActive !== 'monthly') setHoldsGate(false)
      return
    }
    if (gateActive !== null && gateActive !== 'match') return
    if (claimGate('monthly')) setHoldsGate(true)
  }, [hasQueue, gateActive, holdsGate, claimGate])

  useEffect(() => {
    if (!hasQueue && holdsGate) {
      releaseGate('monthly')
      setHoldsGate(false)
    }
  }, [hasQueue, holdsGate, releaseGate])
  useEffect(() => {
    return () => releaseGate('monthly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hasQueue || !holdsGate) return null

  return (
    <MonthlyTrophyReveal
      queue={queue}
      onDone={() => {
        setQueue([])
        releaseGate('monthly')
        setHoldsGate(false)
      }}
    />
  )
}
