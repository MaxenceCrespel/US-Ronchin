import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  CalendarCheck,
  Crown,
  Link2,
  ListChecks,
  Pencil,
  Shield,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_VARIANTS } from '@/lib/labels'
import { attendanceButtonClass } from '@/lib/attendance-styles'
import { useCelebration } from '@/lib/useCelebration'
import { Confetti } from '@/components/Confetti'
import type {
  AttendanceStatus,
  GoalType,
  MatchComposition,
  MatchEventType,
  MatchHomeAway,
  User,
} from '@/lib/types'

/** A composition entry that's a real registered player — MOTM/Defense Boss voting and
 * ratings only ever operate on these, guests (no account yet) are excluded upstream. */
type ComposedPlayer = MatchComposition & { userId: string; user: User }
const isComposedPlayer = (entry: MatchComposition): entry is ComposedPlayer =>
  !!entry.userId && !!entry.user
import { isRosterPlayer } from '@/lib/roster'
import { fetchPlayers } from '@/features/players/api'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AccountLevelRing, useAllAccountLevels } from '@/components/AccountLevelRing'
import { bandForY, PitchFormationEditor } from './PitchFormationEditor'
import {
  addEvent,
  deleteEvent,
  deleteMatch,
  fetchComposition,
  fetchEvents,
  fetchMatch,
  fetchDefenseBoss,
  fetchMatchAttendance,
  fetchMotm,
  fetchMyRatings,
  fetchRatingsSubmitted,
  fetchRatingsSummary,
  linkCompositionGuest,
  setComposition,
  setMyMatchAttendance,
  submitRatings,
  updateMatch,
  voteDefenseBoss,
  voteMotm,
} from './api'

interface FormationRow {
  ratio: number
  y: number
}

const FORMATIONS: Record<string, { label: string; rows: FormationRow[] }> = {
  '4-4-2': { label: '4-4-2', rows: [{ ratio: 4, y: 70 }, { ratio: 4, y: 45 }, { ratio: 2, y: 18 }] },
  '4-3-3': { label: '4-3-3', rows: [{ ratio: 4, y: 70 }, { ratio: 3, y: 45 }, { ratio: 3, y: 18 }] },
  '3-5-2': { label: '3-5-2', rows: [{ ratio: 3, y: 72 }, { ratio: 5, y: 45 }, { ratio: 2, y: 18 }] },
  '3-4-3': { label: '3-4-3', rows: [{ ratio: 3, y: 72 }, { ratio: 4, y: 45 }, { ratio: 3, y: 18 }] },
  '5-3-2': { label: '5-3-2', rows: [{ ratio: 5, y: 75 }, { ratio: 3, y: 45 }, { ratio: 2, y: 18 }] },
  '4-2-3-1': {
    label: '4-2-3-1',
    rows: [{ ratio: 4, y: 72 }, { ratio: 2, y: 55 }, { ratio: 3, y: 35 }, { ratio: 1, y: 15 }],
  },
}
const DEFAULT_FORMATION = '4-4-2'

/** Largest-remainder split — keeps sensible row sizes even when the squad isn't exactly 11. */
function splitByRatio(total: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0)
  const raw = ratios.map((r) => (r / sum) * total)
  const floors = raw.map(Math.floor)
  const remainder = total - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < remainder; k++) floors[order[k].i] += 1
  return floors
}

/** Lays out the chosen formation's slots; the coach can still drag players to fine-tune afterwards. */
function layoutForFormation(
  formationKey: string,
  starterIds: string[],
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {}
  if (starterIds.length === 0) return result
  const [gk, ...rest] = starterIds
  result[gk] = { x: 50, y: 92 }
  const formation = FORMATIONS[formationKey] ?? FORMATIONS[DEFAULT_FORMATION]
  const counts = splitByRatio(rest.length, formation.rows.map((r) => r.ratio))
  let cursor = 0
  formation.rows.forEach((row, i) => {
    const n = counts[i]
    const ids = rest.slice(cursor, cursor + n)
    cursor += n
    ids.forEach((id, j) => {
      result[id] = { x: (100 / (ids.length + 1)) * (j + 1), y: row.y }
    })
  })
  return result
}

const EVENT_LABELS: Record<MatchEventType, string> = {
  GOAL: 'But',
  YELLOW_CARD: 'Carton jaune',
  RED_CARD: 'Carton rouge',
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  FOOT: 'Du pied',
  HEAD: 'De la tête',
  PENALTY: 'Pénalty',
  OWN_GOAL: 'Contre son camp',
}

const RATING_OPTIONS = Array.from({ length: 11 }, (_, i) => i)

/** Once a guest composition entry's player creates a real account, the coach links the
 * entry to it here — the match sheet then counts for that player's stats/badges. */
function LinkGuestButton({ matchId, compositionId }: { matchId: string; compositionId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })
  const compositionQuery = useQuery({
    queryKey: ['composition', matchId],
    queryFn: () => fetchComposition(matchId),
  })
  const composedIds = new Set(
    (compositionQuery.data ?? []).map((e) => e.userId).filter((id): id is string => !!id),
  )
  const candidates = (playersQuery.data ?? []).filter(
    (p) => isRosterPlayer(p) && !composedIds.has(p.id),
  )

  const mutation = useMutation({
    mutationFn: () => linkCompositionGuest(matchId, compositionId, selectedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composition', matchId] })
      setOpen(false)
      setSelectedUserId('')
    },
  })

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => setOpen(true)}>
        <Link2 className="size-3" />
        Lier à un compte
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
        <SelectTrigger className="h-7 w-36 text-xs">
          <SelectValue placeholder="Choisir un compte" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={!selectedUserId || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        OK
      </Button>
      {mutation.isError && (
        <p className="text-destructive text-xs">Échec — réessaie.</p>
      )}
    </div>
  )
}

function RatingDraftPicker({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (value: number) => void
}) {
  return (
    <Select value={value != null ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-20">
        <SelectValue placeholder="Note" />
      </SelectTrigger>
      <SelectContent>
        {RATING_OPTIONS.map((v) => (
          <SelectItem key={v} value={String(v)}>
            {v}/10
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const matchId = id!
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)
  const queryClient = useQueryClient()

  const matchQuery = useQuery({ queryKey: ['match', matchId], queryFn: () => fetchMatch(matchId) })

  // The configuration block (score/composition/events editing) only shows on demand — it
  // auto-opens once for a brand-new match that still needs setup, and otherwise stays
  // hidden until the coach explicitly asks for it. Crucially it never auto-closes (e.g. on
  // a successful save), so the layout doesn't jump around under the coach mid-edit.
  const [configOpen, setConfigOpen] = useState(false)
  const autoOpenedConfigRef = useRef(false)

  const [editingMatch, setEditingMatch] = useState(false)
  const [editOpponent, setEditOpponent] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editKickOffTime, setEditKickOffTime] = useState('')
  const [editHomeAway, setEditHomeAway] = useState<MatchHomeAway>('HOME')
  const [editVenue, setEditVenue] = useState('')

  useEffect(() => {
    if (matchQuery.data) {
      setEditOpponent(matchQuery.data.opponent)
      setEditDate(matchQuery.data.date)
      setEditKickOffTime(matchQuery.data.kickOffTime?.slice(0, 5) ?? '')
      setEditHomeAway(matchQuery.data.homeAway)
      setEditVenue(matchQuery.data.venue ?? '')
    }
  }, [matchQuery.data])

  const updateMatchMutation = useMutation({
    mutationFn: () =>
      updateMatch(matchId, {
        opponent: editOpponent,
        date: editDate,
        kickOffTime: editKickOffTime || undefined,
        homeAway: editHomeAway,
        venue: editVenue || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      setEditingMatch(false)
    },
  })

  const deleteMatchMutation = useMutation({
    mutationFn: () => deleteMatch(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      navigate('/matches')
    },
  })
  const playersQuery = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
    enabled: isCoach,
  })
  const compositionQuery = useQuery({
    queryKey: ['composition', matchId],
    queryFn: () => fetchComposition(matchId),
  })
  const eventsQuery = useQuery({
    queryKey: ['events', matchId],
    queryFn: () => fetchEvents(matchId),
  })

  useEffect(() => {
    if (autoOpenedConfigRef.current) return
    if (!matchQuery.data || !compositionQuery.data) return
    autoOpenedConfigRef.current = true
    const hasKickedOff =
      new Date(`${matchQuery.data.date}T${matchQuery.data.kickOffTime ?? '00:00:00'}`).getTime() <=
      Date.now()
    if (compositionQuery.data.length === 0 && matchQuery.data.status !== 'PLAYED' && hasKickedOff) {
      setConfigOpen(true)
    }
  }, [matchQuery.data, compositionQuery.data])

  const [scoreHome, setScoreHome] = useState('')
  const [scoreAway, setScoreAway] = useState('')
  useEffect(() => {
    if (matchQuery.data) {
      setScoreHome(matchQuery.data.scoreHome?.toString() ?? '')
      setScoreAway(matchQuery.data.scoreAway?.toString() ?? '')
    }
  }, [matchQuery.data])

  const scoreMutation = useMutation({
    mutationFn: () =>
      updateMatch(matchId, {
        scoreHome: scoreHome ? Number(scoreHome) : undefined,
        scoreAway: scoreAway ? Number(scoreAway) : undefined,
        status: 'PLAYED',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match', matchId] }),
  })

  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, { played: boolean; starter: boolean }>>(
    {},
  )
  const [playerNotes, setPlayerNotes] = useState<Record<string, string>>({})
  // Players not yet registered in the app — keyed by a synthetic id (their composition row
  // id once saved, or a client-generated placeholder before the first save).
  const [guests, setGuests] = useState<Record<string, { firstName: string; lastName: string }>>({})
  const [newGuestFirstName, setNewGuestFirstName] = useState('')
  const [newGuestLastName, setNewGuestLastName] = useState('')
  const [formation, setFormation] = useState(DEFAULT_FORMATION)
  // Ordered starter keys (userId, or a guest's key) — index determines which fixed formation slot each player occupies.
  const [slotOrder, setSlotOrder] = useState<string[]>([])
  useEffect(() => {
    if (compositionQuery.data) {
      const map: Record<string, { played: boolean; starter: boolean }> = {}
      const notes: Record<string, string> = {}
      const guestMap: Record<string, { firstName: string; lastName: string }> = {}
      for (const entry of compositionQuery.data) {
        const key = entry.userId ?? entry.id
        map[key] = { played: true, starter: entry.isStarter }
        if (entry.note) notes[key] = entry.note
        if (!entry.userId && entry.guestFirstName && entry.guestLastName) {
          guestMap[key] = { firstName: entry.guestFirstName, lastName: entry.guestLastName }
        }
      }
      setSelectedPlayers(map)
      setPlayerNotes(notes)
      setGuests(guestMap)
      setSlotOrder(
        compositionQuery.data
          .filter((e) => e.isStarter)
          .sort((a, b) => (a.formationY ?? 0) - (b.formationY ?? 0))
          .map((e) => e.userId ?? e.id),
      )
    }
  }, [compositionQuery.data])

  function addGuest() {
    const firstName = newGuestFirstName.trim()
    const lastName = newGuestLastName.trim()
    if (!firstName || !lastName) return
    const key = `guest-${crypto.randomUUID()}`
    setGuests((prev) => ({ ...prev, [key]: { firstName, lastName } }))
    setSelectedPlayers((prev) => ({ ...prev, [key]: { played: true, starter: false } }))
    setNewGuestFirstName('')
    setNewGuestLastName('')
  }

  function removeGuest(key: string) {
    setGuests((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setSelectedPlayers((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPlayerNotes((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const starterIds = Object.entries(selectedPlayers)
    .filter(([, v]) => v.played && v.starter)
    .map(([id]) => id)
  // Keep slotOrder in sync when starters are toggled: preserve existing order, append new ones.
  useEffect(() => {
    setSlotOrder((prev) => {
      const kept = prev.filter((id) => starterIds.includes(id))
      const added = starterIds.filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterIds.join(',')])

  const formationCoords = useMemo(
    () => layoutForFormation(formation, slotOrder),
    [formation, slotOrder],
  )

  function swapSlots(a: string, b: string) {
    setSlotOrder((prev) => {
      const arr = [...prev]
      const i = arr.indexOf(a)
      const j = arr.indexOf(b)
      if (i === -1 || j === -1) return prev
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }

  const formationPlayers = slotOrder.map((id) => {
    const player = playersQuery.data?.find((p) => p.id === id)
    const guest = guests[id]
    const pos = formationCoords[id] ?? { x: 50, y: 50 }
    return {
      userId: id,
      firstName: player?.firstName ?? guest?.firstName ?? '',
      lastName: player?.lastName ?? guest?.lastName ?? '',
      shirtNumber: player?.jerseyNumber ?? null,
      x: pos.x,
      y: pos.y,
    }
  })

  const compositionMutation = useMutation({
    mutationFn: () =>
      setComposition(
        matchId,
        Object.entries(selectedPlayers)
          .filter(([, v]) => v.played)
          .map(([key, v]) => {
            const note = playerNotes[key]?.trim() || undefined
            const guest = guests[key]
            const identity = guest
              ? { guestFirstName: guest.firstName, guestLastName: guest.lastName }
              : { userId: key }
            if (!v.starter) return { ...identity, isStarter: false, note }
            const pos = formationCoords[key]
            return {
              ...identity,
              isStarter: true,
              position: pos ? bandForY(pos.y) : undefined,
              formationX: pos?.x,
              formationY: pos?.y,
              note,
            }
          }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['composition', matchId] }),
  })

  // Only players actually on the match sheet can have scored/been carded — falls back to
  // the full roster if the composition hasn't been entered yet. Guests (no account) show up
  // by name too, so the coach doesn't have to retype them via "Autre" each time.
  const eventPlayerPool: { id: string; firstName: string; lastName: string; isGuest: boolean }[] =
    compositionQuery.data && compositionQuery.data.length > 0
      ? compositionQuery.data.map((entry) =>
          entry.user
            ? {
                id: entry.user.id,
                firstName: entry.user.firstName,
                lastName: entry.user.lastName,
                isGuest: false,
              }
            : {
                id: entry.id,
                firstName: entry.guestFirstName ?? '',
                lastName: entry.guestLastName ?? '',
                isGuest: true,
              },
        )
      : (playersQuery.data ?? [])
          .filter((p) => isRosterPlayer(p))
          .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, isGuest: false }))

  const OTHER_SCORER = '__other__'
  const [eventType, setEventType] = useState<MatchEventType>('GOAL')
  const [eventUserId, setEventUserId] = useState('')
  const [eventScorerName, setEventScorerName] = useState('')
  const [eventAssistUserId, setEventAssistUserId] = useState('')
  const [eventMinute, setEventMinute] = useState('')
  const [eventGoalType, setEventGoalType] = useState<GoalType | ''>('')

  const addEventMutation = useMutation({
    mutationFn: () => {
      const selected = eventPlayerPool.find((p) => p.id === eventUserId)
      return addEvent(matchId, {
        type: eventType,
        userId: eventUserId !== OTHER_SCORER && !selected?.isGuest ? eventUserId : undefined,
        scorerName:
          eventUserId === OTHER_SCORER
            ? eventScorerName.trim()
            : selected?.isGuest
              ? `${selected.firstName} ${selected.lastName}`.trim()
              : undefined,
        assistUserId: eventType === 'GOAL' && eventAssistUserId ? eventAssistUserId : undefined,
        minute: eventMinute ? Number(eventMinute) : undefined,
        goalType: eventType === 'GOAL' && eventGoalType ? eventGoalType : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', matchId] })
      setEventUserId('')
      setEventScorerName('')
      setEventAssistUserId('')
      setEventMinute('')
      setEventGoalType('')
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => deleteEvent(matchId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events', matchId] }),
  })

  const myRatingsQuery = useQuery({
    queryKey: ['my-ratings', matchId],
    queryFn: () => fetchMyRatings(matchId),
  })

  const attendanceQuery = useQuery({
    queryKey: ['match-attendance', matchId],
    queryFn: () => fetchMatchAttendance(matchId),
  })

  const attendanceMutation = useMutation({
    mutationFn: (status: AttendanceStatus) => setMyMatchAttendance(matchId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match-attendance', matchId] }),
  })

  const ratingsSummaryQuery = useQuery({
    queryKey: ['ratings-summary', matchId],
    queryFn: () => fetchRatingsSummary(matchId),
  })

  const ratingsSubmittedQuery = useQuery({
    queryKey: ['ratings-submitted', matchId],
    queryFn: () => fetchRatingsSubmitted(matchId),
  })

  const levelsQuery = useAllAccountLevels()

  const [ratingDrafts, setRatingDrafts] = useState<Record<string, number>>({})

  const submitRatingsMutation = useMutation({
    mutationFn: (ratings: { ratedUserId: string; rating: number }[]) =>
      submitRatings(matchId, ratings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ratings', matchId] })
      queryClient.invalidateQueries({ queryKey: ['ratings-summary', matchId] })
      queryClient.invalidateQueries({ queryKey: ['ratings-submitted', matchId] })
      setRatingDrafts({})
    },
  })

  const motmQuery = useQuery({
    queryKey: ['motm', matchId],
    queryFn: () => fetchMotm(matchId),
    refetchInterval: 30000,
  })

  const [motmSelection, setMotmSelection] = useState('')
  const motmMutation = useMutation({
    mutationFn: (votedForId: string) => voteMotm(matchId, votedForId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['motm', matchId] }),
  })

  const { active: motmCelebration, trigger: triggerMotmCelebration } = useCelebration()
  useEffect(() => {
    if (!motmQuery.data?.revealed || !user) return
    const winner = motmQuery.data.results?.[0]
    if (winner?.userId !== user.id) return

    const flagKey = `motm-celebrated-${matchId}-${user.id}`
    try {
      if (localStorage.getItem(flagKey)) return
      localStorage.setItem(flagKey, '1')
    } catch {
      // ignore — celebration just won't be deduplicated across visits.
    }
    triggerMotmCelebration()
  }, [motmQuery.data, matchId, user, triggerMotmCelebration])

  const defenseBossQuery = useQuery({
    queryKey: ['defense-boss', matchId],
    queryFn: () => fetchDefenseBoss(matchId),
    refetchInterval: 30000,
  })

  const [defenseBossSelection, setDefenseBossSelection] = useState('')
  const defenseBossMutation = useMutation({
    mutationFn: (votedForId: string) => voteDefenseBoss(matchId, votedForId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['defense-boss', matchId] }),
  })

  const { active: defenseBossCelebration, trigger: triggerDefenseBossCelebration } = useCelebration()
  useEffect(() => {
    if (!defenseBossQuery.data?.revealed || !user) return
    const winner = defenseBossQuery.data.results?.[0]
    if (winner?.userId !== user.id) return

    const flagKey = `defense-boss-celebrated-${matchId}-${user.id}`
    try {
      if (localStorage.getItem(flagKey)) return
      localStorage.setItem(flagKey, '1')
    } catch {
      // ignore — celebration just won't be deduplicated across visits.
    }
    triggerDefenseBossCelebration()
  }, [defenseBossQuery.data, matchId, user, triggerDefenseBossCelebration])

  // Per-player goals/assists/cards for this match — no such aggregation exists server-side
  // for a single match, so it's derived client-side from the raw event list.
  const eventStatsByUser = useMemo(() => {
    const map: Record<string, { goals: number; assists: number; yellow: number; red: number }> = {}
    const bump = (id: string, key: 'goals' | 'assists' | 'yellow' | 'red') => {
      map[id] ??= { goals: 0, assists: 0, yellow: 0, red: 0 }
      map[id][key] += 1
    }
    // A guest scorer has no userId — keyed by their name instead so their goals still show
    // up against their composition row (see guestStatsKey below).
    for (const event of eventsQuery.data ?? []) {
      const scorerKey = event.userId ?? (event.scorerName ? `name:${event.scorerName}` : null)
      if (event.type === 'GOAL') {
        if (scorerKey) bump(scorerKey, 'goals')
        if (event.assistUserId) bump(event.assistUserId, 'assists')
      } else if (event.type === 'YELLOW_CARD') {
        if (scorerKey) bump(scorerKey, 'yellow')
      } else if (event.type === 'RED_CARD') {
        if (scorerKey) bump(scorerKey, 'red')
      }
    }
    return map
  }, [eventsQuery.data])

  const match = matchQuery.data
  if (!match) return null

  // The coach can only configure a match (score, composition, events) once it has
  // actually kicked off — no pre-announcing the lineup, everything is entered after
  // the fact. Falls back to midnight on the match date when no kick-off time is set.
  const matchTimeHasPassed =
    new Date(`${match.date}T${match.kickOffTime ?? '00:00:00'}`).getTime() <= Date.now()

  const iPlayed = compositionQuery.data?.some((entry) => entry.userId === user?.id) ?? false
  // Guests (no account yet) can't vote or be voted for — excluded from every voting/rating pool.
  const teammates =
    compositionQuery.data?.filter(isComposedPlayer).filter((entry) => entry.userId !== user?.id) ??
    []
  const hasComposition = (compositionQuery.data?.length ?? 0) > 0
  // Voting/rating is mandatory for anyone who played, coach included — no role exception.
  const votingApplies = match.status === 'PLAYED' && iPlayed && hasComposition
  const hasVotedMotm = motmQuery.data?.myVoteUserId != null
  const motmRevealed = motmQuery.data?.revealed ?? false
  const ratingsSubmitted = ratingsSubmittedQuery.data ?? false
  // Two independent gates: the MOTM vote is only forced while its window is still open
  // (motmRevealed — everyone voted, or the 24h window elapsed — means voting is closed,
  // forcing it would just soft-lock anyone who missed the window). Ratings have no such
  // time window — they stay mandatory regardless of whether MOTM has been revealed.
  const needsMotmVote = !hasVotedMotm && !motmRevealed
  // Undefined while loading defaults to "applies" so the step never flickers past before
  // we actually know whether a defender played — same fail-safe as the other two gates.
  const defenseBossApplies = defenseBossQuery.data ? defenseBossQuery.data.hasEligibleTargets : true
  const hasVotedDefenseBoss = defenseBossQuery.data?.myVoteUserId != null
  const defenseBossRevealed = defenseBossQuery.data?.revealed ?? false
  const needsDefenseBossVote = defenseBossApplies && !hasVotedDefenseBoss && !defenseBossRevealed
  const needsRatings = !ratingsSubmitted
  const showVoteModal = votingApplies && (needsMotmVote || needsDefenseBossVote || needsRatings)
  const votesTabApplies = match.status === 'PLAYED' && hasComposition

  const scoreCard = (
    <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>vs {match.opponent}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant={match.status === 'PLAYED' ? 'success' : 'outline'}>
                {match.status === 'PLAYED' ? 'Joué' : 'À venir'}
              </Badge>
              {isCoach && !editingMatch && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setEditingMatch(true)}
                    aria-label="Modifier le match"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive size-7"
                    disabled={deleteMatchMutation.isPending}
                    onClick={() => {
                      if (confirm(`Supprimer le match contre ${match.opponent} ?`)) {
                        deleteMatchMutation.mutate()
                      }
                    }}
                    aria-label="Supprimer le match"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        {editingMatch && (
          <CardContent>
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                updateMatchMutation.mutate()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editOpponent">Adversaire</Label>
                <Input
                  id="editOpponent"
                  value={editOpponent}
                  onChange={(e) => setEditOpponent(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editDate">Date</Label>
                <Input
                  id="editDate"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editKickOffTime">Heure (optionnel)</Label>
                <Input
                  id="editKickOffTime"
                  type="time"
                  value={editKickOffTime}
                  onChange={(e) => setEditKickOffTime(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Domicile / Extérieur</Label>
                <Select
                  value={editHomeAway}
                  onValueChange={(v) => setEditHomeAway(v as MatchHomeAway)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOME">Domicile</SelectItem>
                    <SelectItem value="AWAY">Extérieur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="editVenue">Lieu (optionnel)</Label>
                <Input
                  id="editVenue"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" size="sm" disabled={updateMatchMutation.isPending}>
                  {updateMatchMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingMatch(false)}
                >
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        )}
        <CardContent className="flex items-center gap-3">
          <Input
            className="w-16"
            type="number"
            min={0}
            value={scoreHome}
            onChange={(e) => setScoreHome(e.target.value)}
            disabled={!isCoach || !matchTimeHasPassed}
          />
          <span>-</span>
          <Input
            className="w-16"
            type="number"
            min={0}
            value={scoreAway}
            onChange={(e) => setScoreAway(e.target.value)}
            disabled={!isCoach || !matchTimeHasPassed}
          />
          {isCoach && matchTimeHasPassed && (
            <Button size="sm" onClick={() => scoreMutation.mutate()} disabled={scoreMutation.isPending}>
              Enregistrer le score
            </Button>
          )}
        </CardContent>
      </Card>
  )

  const presenceCard = match.status !== 'PLAYED' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="text-club-blue size-4" />
              Ma présence
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              {(['PRESENT', 'MAYBE', 'ABSENT'] as AttendanceStatus[]).map((status) => {
                const myAttendance = attendanceQuery.data?.find((a) => a.userId === user?.id)
                return (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    className={attendanceButtonClass(status, myAttendance?.status === status)}
                    disabled={attendanceMutation.isPending}
                    onClick={() => attendanceMutation.mutate(status)}
                  >
                    {ATTENDANCE_STATUS_LABELS[status]}
                  </Button>
                )
              })}
            </div>
            {attendanceQuery.data && attendanceQuery.data.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attendanceQuery.data.map((a) => (
                  <Badge key={a.id} variant={ATTENDANCE_STATUS_VARIANTS[a.status]} className="animate-pop-in">
                    {a.user.firstName} {a.user.lastName[0]}.
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )

  function renderCompositionCard(editable: boolean) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="text-club-blue size-4" />
            Composition
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Joueur</TableHead>
                    <TableHead>A joué</TableHead>
                    <TableHead>Titulaire</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersQuery.data
                    ?.filter((p) => isRosterPlayer(p))
                    .map((player) => {
                      const state = selectedPlayers[player.id] ?? { played: false, starter: false }
                      return (
                        <TableRow key={player.id}>
                          <TableCell>
                            {player.firstName} {player.lastName}
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={state.played}
                              onCheckedChange={(checked) =>
                                setSelectedPlayers((prev) => ({
                                  ...prev,
                                  [player.id]: { played: checked === true, starter: state.starter },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={state.starter}
                              disabled={!state.played}
                              onCheckedChange={(checked) =>
                                setSelectedPlayers((prev) => ({
                                  ...prev,
                                  [player.id]: { played: state.played, starter: checked === true },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {state.played && (
                              <Input
                                className="h-8 w-40 text-xs"
                                placeholder="ex: licence de Quentin"
                                value={playerNotes[player.id] ?? ''}
                                onChange={(e) =>
                                  setPlayerNotes((prev) => ({ ...prev, [player.id]: e.target.value }))
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  {Object.entries(guests).map(([key, guest]) => {
                    const state = selectedPlayers[key] ?? { played: false, starter: false }
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          {guest.firstName} {guest.lastName}
                          <span className="text-muted-foreground ml-1.5 text-xs">(non inscrit)</span>
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={state.played}
                            onCheckedChange={(checked) =>
                              setSelectedPlayers((prev) => ({
                                ...prev,
                                [key]: { played: checked === true, starter: state.starter },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={state.starter}
                            disabled={!state.played}
                            onCheckedChange={(checked) =>
                              setSelectedPlayers((prev) => ({
                                ...prev,
                                [key]: { played: state.played, starter: checked === true },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => removeGuest(key)}
                            aria-label="Retirer ce joueur"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Prénom"
                  className="h-8 w-28 text-xs"
                  value={newGuestFirstName}
                  onChange={(e) => setNewGuestFirstName(e.target.value)}
                />
                <Input
                  placeholder="Nom"
                  className="h-8 w-28 text-xs"
                  value={newGuestLastName}
                  onChange={(e) => setNewGuestLastName(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!newGuestFirstName.trim() || !newGuestLastName.trim()}
                  onClick={addGuest}
                >
                  <UserPlus className="size-3.5" />
                  Ajouter un joueur non inscrit
                </Button>
              </div>

              {formationPlayers.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs">
                      Choisis une composition type puis glisse les joueurs pour ajuster.
                    </p>
                    <Select value={formation} onValueChange={setFormation}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FORMATIONS).map(([key, f]) => (
                          <SelectItem key={key} value={key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <PitchFormationEditor players={formationPlayers} onSwap={swapSlots} />
                </div>
              )}

              {compositionMutation.isError && (
                <p className="text-destructive mt-2 text-sm">
                  Échec de l'enregistrement de la composition. Réessaie — si ça persiste,
                  vérifie ta connexion ou reconnecte-toi.
                </p>
              )}
              {compositionMutation.isSuccess && (
                <p className="mt-2 text-sm text-emerald-600">Composition enregistrée.</p>
              )}
              <Button
                className="mt-4"
                onClick={() => compositionMutation.mutate()}
                disabled={compositionMutation.isPending}
              >
                {compositionMutation.isPending ? 'Enregistrement...' : 'Enregistrer la composition'}
              </Button>
            </>
          ) : (compositionQuery.data ?? []).some((e) => e.isStarter && e.formationX != null) ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
              <PitchFormationEditor
                readOnly
                players={(compositionQuery.data ?? [])
                  .filter((e) => e.isStarter && e.formationX != null && e.formationY != null)
                  .map((e) => ({
                    userId: e.userId ?? e.id,
                    firstName: e.user?.firstName ?? e.guestFirstName ?? '',
                    lastName: e.user?.lastName ?? e.guestLastName ?? '',
                    shirtNumber: e.user?.jerseyNumber ?? null,
                    x: e.formationX!,
                    y: e.formationY!,
                  }))}
                onSwap={() => {}}
              />
              {(compositionQuery.data ?? []).some((e) => !e.isStarter) && (
                <div className="flex flex-col gap-2 sm:w-40 sm:pt-2">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Remplaçants
                  </p>
                  {(compositionQuery.data ?? [])
                    .filter((entry) => !entry.isStarter)
                    .map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-sm">
                          <PlayerAvatar
                            avatarUrl={entry.user?.avatarUrl}
                            firstName={entry.user?.firstName ?? entry.guestFirstName ?? ''}
                            lastName={entry.user?.lastName ?? entry.guestLastName ?? ''}
                            size="sm"
                          />
                          {entry.user
                            ? `${entry.user.firstName} ${entry.user.lastName}`
                            : `${entry.guestFirstName} ${entry.guestLastName}`}
                        </div>
                        {!entry.user && isCoach && (
                          <LinkGuestButton matchId={matchId} compositionId={entry.id} />
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {compositionQuery.data?.map((entry) => (
                <div key={entry.id} className="flex flex-col items-start gap-0.5">
                  <Badge variant={entry.isStarter ? 'default' : 'secondary'}>
                    {entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : `${entry.guestFirstName} ${entry.guestLastName}`}
                  </Badge>
                  {!entry.user && isCoach && (
                    <LinkGuestButton matchId={matchId} compositionId={entry.id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  function renderEventsCard(editable: boolean) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="text-club-blue size-4" />
            Événements
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editable && (
            <form
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault()
                const canSubmit =
                  eventUserId && (eventUserId !== OTHER_SCORER || eventScorerName.trim())
                if (canSubmit) addEventMutation.mutate()
              }}
            >
              <Select value={eventType} onValueChange={(v) => setEventType(v as MatchEventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={eventUserId} onValueChange={setEventUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Joueur" />
                </SelectTrigger>
                <SelectContent>
                  {eventPlayerPool.map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.firstName} {player.lastName}
                      {player.isGuest && ' (non inscrit)'}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_SCORER}>Autre (pas encore inscrit)</SelectItem>
                </SelectContent>
              </Select>

              {eventUserId === OTHER_SCORER && (
                <Input
                  placeholder="Nom du joueur"
                  value={eventScorerName}
                  onChange={(e) => setEventScorerName(e.target.value)}
                  className="col-span-2 sm:col-span-1"
                />
              )}

              {eventType === 'GOAL' && (
                <Select value={eventAssistUserId} onValueChange={setEventAssistUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Passeur (optionnel)" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventPlayerPool
                      .filter((p) => p.id !== eventUserId && !p.isGuest)
                      .map((player) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.firstName} {player.lastName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {eventType === 'GOAL' && (
                <Select
                  value={eventGoalType}
                  onValueChange={(v) => setEventGoalType(v as GoalType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type de but (optionnel)" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Minute"
                  min={0}
                  max={130}
                  value={eventMinute}
                  onChange={(e) => setEventMinute(e.target.value)}
                />
                <Button
                  type="submit"
                  disabled={
                    !eventUserId ||
                    (eventUserId === OTHER_SCORER && !eventScorerName.trim()) ||
                    addEventMutation.isPending
                  }
                >
                  Ajouter
                </Button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-2">
            {eventsQuery.data?.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  {event.minute != null ? `${event.minute}' — ` : ''}
                  <strong>{EVENT_LABELS[event.type]}</strong> —{' '}
                  {event.user ? `${event.user.firstName} ${event.user.lastName}` : event.scorerName}
                  {event.goalType && <> ({GOAL_TYPE_LABELS[event.goalType]})</>}
                  {event.assistUser && (
                    <>
                      {' '}
                      (passe de {event.assistUser.firstName} {event.assistUser.lastName})
                    </>
                  )}
                </span>
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteEventMutation.mutate(event.id)}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            ))}
            {eventsQuery.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">Aucun événement enregistré.</p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const motmCard = match.status === 'PLAYED' && hasComposition && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="text-club-gold size-4" />
              Homme du match
            </CardTitle>
            <CardDescription>
              {motmQuery.data?.revealed
                ? 'Résultat révélé.'
                : `Vote en cours — révélé automatiquement quand tout le monde a voté, ou 24h après le premier vote (${motmQuery.data?.totalVotes ?? 0}/${motmQuery.data?.totalPlayers ?? 0}).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {motmQuery.data?.revealed ? (
              motmQuery.data.results && motmQuery.data.results.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {motmQuery.data.results.map((r, index) => (
                    <li key={r.userId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {index === 0 && <Crown className="text-club-gold size-4" />}
                        {r.firstName} {r.lastName}
                      </span>
                      <Badge variant="secondary">{r.votes} vote(s)</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun vote exprimé.</p>
              )
            ) : iPlayed ? (
              motmQuery.data?.myVoteUserId ? (
                <div className="flex items-center gap-3">
                  {(() => {
                    const voted = teammates.find((t) => t.userId === motmQuery.data?.myVoteUserId)
                    return voted ? (
                      <PlayerAvatar
                        avatarUrl={voted.user.avatarUrl}
                        firstName={voted.user.firstName}
                        lastName={voted.user.lastName}
                        size="lg"
                        className="border-club-gold ring-club-gold/40 border-2 ring-4"
                      />
                    ) : null
                  })()}
                  <p className="text-sm">
                    <span className="font-medium">Vote enregistré</span>
                    <br />
                    <span className="text-muted-foreground text-xs">
                      Définitif — impossible de le modifier.
                    </span>
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {teammates.map((entry) => {
                      const selected = motmSelection === entry.userId
                      return (
                        <button
                          key={entry.userId}
                          type="button"
                          onClick={() => setMotmSelection(entry.userId)}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <PlayerAvatar
                            avatarUrl={entry.user.avatarUrl}
                            firstName={entry.user.firstName}
                            lastName={entry.user.lastName}
                            size="lg"
                            className={cn(
                              'transition-all duration-150',
                              selected
                                ? 'border-club-gold ring-club-gold/40 border-2 ring-4'
                                : 'opacity-70',
                            )}
                          />
                          <span className="w-16 truncate text-center text-xs font-medium">
                            {entry.user.firstName}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!motmSelection || motmMutation.isPending}
                      onClick={() => motmMutation.mutate(motmSelection)}
                    >
                      Voter
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      Ton vote sera définitif.
                    </span>
                  </div>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                Seuls les joueurs ayant participé peuvent voter.
              </p>
            )}
          </CardContent>
        </Card>
      )

  const defenders = teammates.filter((entry) => entry.position === 'DEFENDER')
  const defenseBossCard = match.status === 'PLAYED' && hasComposition && defenseBossApplies && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="text-club-blue size-4" />
              Patron de la défense
            </CardTitle>
            <CardDescription>
              {defenseBossQuery.data?.revealed
                ? 'Résultat révélé.'
                : `Vote en cours — révélé automatiquement quand tout le monde a voté, ou 24h après le premier vote (${defenseBossQuery.data?.totalVotes ?? 0}/${defenseBossQuery.data?.totalPlayers ?? 0}).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {defenseBossQuery.data?.revealed ? (
              defenseBossQuery.data.results && defenseBossQuery.data.results.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {defenseBossQuery.data.results.map((r, index) => (
                    <li key={r.userId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {index === 0 && <Shield className="text-club-blue size-4" />}
                        {r.firstName} {r.lastName}
                      </span>
                      <Badge variant="secondary">{r.votes} vote(s)</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun vote exprimé.</p>
              )
            ) : iPlayed ? (
              defenseBossQuery.data?.myVoteUserId ? (
                <div className="flex items-center gap-3">
                  {(() => {
                    const voted = defenders.find((t) => t.userId === defenseBossQuery.data?.myVoteUserId)
                    return voted ? (
                      <PlayerAvatar
                        avatarUrl={voted.user.avatarUrl}
                        firstName={voted.user.firstName}
                        lastName={voted.user.lastName}
                        size="lg"
                        className="border-club-blue ring-club-blue/40 border-2 ring-4"
                      />
                    ) : null
                  })()}
                  <p className="text-sm">
                    <span className="font-medium">Vote enregistré</span>
                    <br />
                    <span className="text-muted-foreground text-xs">
                      Définitif — impossible de le modifier.
                    </span>
                  </p>
                </div>
              ) : defenders.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    {defenders.map((entry) => {
                      const selected = defenseBossSelection === entry.userId
                      return (
                        <button
                          key={entry.userId}
                          type="button"
                          onClick={() => setDefenseBossSelection(entry.userId)}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <PlayerAvatar
                            avatarUrl={entry.user.avatarUrl}
                            firstName={entry.user.firstName}
                            lastName={entry.user.lastName}
                            size="lg"
                            className={cn(
                              'transition-all duration-150',
                              selected
                                ? 'border-club-blue ring-club-blue/40 border-2 ring-4'
                                : 'opacity-70',
                            )}
                          />
                          <span className="w-16 truncate text-center text-xs font-medium">
                            {entry.user.firstName}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!defenseBossSelection || defenseBossMutation.isPending}
                      onClick={() => defenseBossMutation.mutate(defenseBossSelection)}
                    >
                      Voter
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      Ton vote sera définitif.
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Aucun défenseur n'a joué ce match.
                </p>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                Seuls les joueurs ayant participé peuvent voter.
              </p>
            )}
          </CardContent>
        </Card>
      )

  const teammatesToRate = (compositionQuery.data ?? [])
    .filter(isComposedPlayer)
    .filter((entry) => entry.userId !== user?.id)
  const allDraftsFilled = teammatesToRate.every((entry) => ratingDrafts[entry.userId] != null)

  const ratingsCard = match.status === 'PLAYED' && hasComposition && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="text-club-blue size-4" />
              Notes des joueurs
            </CardTitle>
            <CardDescription>
              {ratingsSubmitted
                ? "Tes notes sont validées et définitives — voici la moyenne de chacun calculée avec les notes des autres joueurs."
                : "Note chaque coéquipier de 0 à 10, puis valide une fois pour toutes — la moyenne d'un joueur ne s'affiche qu'une fois que tu as validé tes notes, pour ne pas t'influencer."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {compositionQuery.data?.map((entry) => {
              const isSelf = entry.userId === user?.id
              const summary = ratingsSummaryQuery.data?.find((s) => s.userId === entry.userId)
              const myRating = myRatingsQuery.data?.find((r) => r.ratedUserId === entry.userId)

              return (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {entry.user ? (
                      <AccountLevelRing
                        userId={entry.userId!}
                        tier={levelsQuery.data?.[entry.userId!]?.tier}
                        ringWidth={2}
                      >
                        <PlayerAvatar
                          avatarUrl={entry.user.avatarUrl}
                          firstName={entry.user.firstName}
                          lastName={entry.user.lastName}
                          size="sm"
                        />
                      </AccountLevelRing>
                    ) : (
                      <PlayerAvatar
                        firstName={entry.guestFirstName ?? ''}
                        lastName={entry.guestLastName ?? ''}
                        size="sm"
                      />
                    )}
                    {entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : `${entry.guestFirstName} ${entry.guestLastName}`}
                  </span>

                  {!entry.user ? (
                    <span className="text-muted-foreground text-xs">Pas encore de compte</span>
                  ) : !iPlayed ? (
                    <span className="text-muted-foreground text-xs">
                      Seuls les joueurs ayant participé peuvent noter
                    </span>
                  ) : ratingsSubmitted ? (
                    isSelf ? (
                      <span className="text-muted-foreground text-xs">
                        {summary?.average != null
                          ? `Moyenne : ${summary.average.toFixed(1)}/10`
                          : 'Pas encore de note'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary">Ta note : {myRating?.rating}/10</Badge>
                        <span className="text-muted-foreground">
                          {summary?.average != null
                            ? `Moyenne : ${summary.average.toFixed(1)}/10 (${summary.count})`
                            : ''}
                        </span>
                      </span>
                    )
                  ) : isSelf ? (
                    <span className="text-muted-foreground text-xs">Tu ne peux pas te noter toi-même</span>
                  ) : (
                    <RatingDraftPicker
                      value={ratingDrafts[entry.userId!]}
                      onChange={(value) =>
                        setRatingDrafts((prev) => ({ ...prev, [entry.userId!]: value }))
                      }
                    />
                  )}
                </div>
              )
            })}

            {iPlayed && !ratingsSubmitted && (
              <div className="flex items-center justify-between gap-2 border-t pt-4">
                <p className="text-muted-foreground text-xs">
                  Une fois validées, tes notes sont définitives et ne pourront plus être modifiées.
                </p>
                <Button
                  size="sm"
                  disabled={!allDraftsFilled || submitRatingsMutation.isPending}
                  onClick={() =>
                    submitRatingsMutation.mutate(
                      teammatesToRate.map((entry) => ({
                        ratedUserId: entry.userId,
                        rating: ratingDrafts[entry.userId]!,
                      })),
                    )
                  }
                >
                  Valider mes notes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )

  const motmWinner = motmQuery.data?.revealed ? (motmQuery.data.results?.[0] ?? null) : null
  const motmWinnerEntry = motmWinner
    ? compositionQuery.data?.find((e) => e.userId === motmWinner.userId)
    : undefined

  const recapHeader = (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>vs {match.opponent}</span>
          <Badge variant={match.status === 'PLAYED' ? 'success' : 'outline'}>
            {match.status === 'PLAYED' ? 'Joué' : 'À venir'}
          </Badge>
        </CardTitle>
        <CardDescription className="capitalize">
          {format(new Date(match.date), 'EEEE d MMMM yyyy', { locale: fr })}
          {match.competition && ` · ${match.competition}`}
          {' · '}
          {match.homeAway === 'HOME' ? 'Domicile' : 'Extérieur'}
          {match.venue && ` · ${match.venue}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-3xl font-bold">
          {match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}
        </p>

        {motmWinner ? (
          <div className="flex items-center gap-2.5">
            <PlayerAvatar
              avatarUrl={motmWinnerEntry?.user?.avatarUrl}
              firstName={motmWinner.firstName}
              lastName={motmWinner.lastName}
              size="sm"
              className="border-club-gold ring-club-gold/40 border-2 ring-2"
            />
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Crown className="text-club-gold size-4" />
              {motmWinner.firstName} {motmWinner.lastName}
            </span>
          </div>
        ) : hasComposition ? (
          <div className="flex flex-col items-center gap-3 py-1">
            <div className="border-club-gold/40 bg-club-gold/10 animate-legendary-pulse flex size-11 items-center justify-center rounded-full border">
              <Crown className="text-club-gold size-5" />
            </div>
            <span className="text-muted-foreground text-xs">Homme du match : vote en cours…</span>
            <div className="flex flex-wrap justify-center gap-2">
              {(compositionQuery.data ?? []).map((entry, i) => (
                <div
                  key={entry.id}
                  className="animate-motm-sweep"
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  <PlayerAvatar
                    avatarUrl={entry.user?.avatarUrl}
                    firstName={entry.user?.firstName ?? entry.guestFirstName ?? ''}
                    lastName={entry.user?.lastName ?? entry.guestLastName ?? ''}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(eventsQuery.data?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5 border-t pt-4">
            {[...(eventsQuery.data ?? [])]
              .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
              .map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-sm">
                  {event.minute != null && (
                    <span className="text-muted-foreground w-8 shrink-0 text-xs">
                      {event.minute}'
                    </span>
                  )}
                  {event.type === 'GOAL' && <span>⚽</span>}
                  {event.type === 'YELLOW_CARD' && <span>🟨</span>}
                  {event.type === 'RED_CARD' && <span>🟥</span>}
                  <span>
                    {event.user ? `${event.user.firstName} ${event.user.lastName}` : event.scorerName}
                  </span>
                  {event.assistUser && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      🎯 {event.assistUser.firstName} {event.assistUser.lastName}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const statsTable = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stats du match</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="-mx-2 overflow-x-auto px-2">
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="bg-card sticky left-0 z-10 px-1.5 sm:px-2">Joueur</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">Note moy.</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">Ma note</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">Buts</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">Passes D.</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">🟨</TableHead>
                <TableHead className="px-1.5 text-right sm:px-2">🟥</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compositionQuery.data?.map((entry) => {
                const isSelf = entry.userId === user?.id
                const summary = ratingsSummaryQuery.data?.find((s) => s.userId === entry.userId)
                const myRating = myRatingsQuery.data?.find((r) => r.ratedUserId === entry.userId)
                const guestStatsKey = entry.guestFirstName
                  ? `name:${entry.guestFirstName} ${entry.guestLastName}`
                  : null
                const statsKey = entry.userId ?? guestStatsKey
                const stats = (statsKey ? eventStatsByUser[statsKey] : undefined) ?? {
                  goals: 0,
                  assists: 0,
                  yellow: 0,
                  red: 0,
                }
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="bg-card sticky left-0 z-10 px-1.5 font-medium sm:px-2">
                      <span className="flex items-center gap-1.5 sm:gap-2">
                        {entry.user ? (
                          <AccountLevelRing
                            userId={entry.userId!}
                            tier={levelsQuery.data?.[entry.userId!]?.tier}
                            ringWidth={2}
                          >
                            <PlayerAvatar
                              avatarUrl={entry.user.avatarUrl}
                              firstName={entry.user.firstName}
                              lastName={entry.user.lastName}
                              size="sm"
                            />
                          </AccountLevelRing>
                        ) : (
                          <PlayerAvatar
                            firstName={entry.guestFirstName ?? ''}
                            lastName={entry.guestLastName ?? ''}
                            size="sm"
                          />
                        )}
                        {entry.user
                          ? `${entry.user.firstName} ${entry.user.lastName}`
                          : `${entry.guestFirstName} ${entry.guestLastName}`}
                      </span>
                    </TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">
                      {summary?.average != null ? `${summary.average.toFixed(1)}/10` : '—'}
                    </TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">
                      {isSelf || myRating == null ? '—' : `${myRating.rating}/10`}
                    </TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">{stats.goals}</TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">{stats.assists}</TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">{stats.yellow}</TableCell>
                    <TableCell className="px-1.5 text-right sm:px-2">{stats.red}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )

  const compositionSummaryView = renderCompositionCard(false)

  // MOTM vote, then patron de la défense (skipped if no defender played), then ratings —
  // advancing is implicit, driven by each gate rather than separate local step state.
  const voteSteps = [
    {
      needed: needsMotmVote,
      node: motmCard,
      title: 'Vote obligatoire',
      description: "Avant de voir le résumé du match, vote pour l'homme du match.",
    },
    ...(defenseBossApplies
      ? [
          {
            needed: needsDefenseBossVote,
            node: defenseBossCard,
            title: 'Vote obligatoire',
            description: 'Avant de voir le résumé du match, vote pour le patron de la défense.',
          },
        ]
      : []),
    {
      needed: needsRatings,
      node: ratingsCard,
      title: 'Notes obligatoires',
      description: 'Avant de voir le résumé du match, note tes coéquipiers.',
    },
  ]
  const activeStepIndex = voteSteps.findIndex((s) => s.needed)
  const activeStep = activeStepIndex >= 0 ? voteSteps[activeStepIndex] : null

  const voteModal = (
    <Dialog open={showVoteModal}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] flex-col gap-6 overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {activeStep && (
          <>
            <DialogHeader>
              <DialogTitle>
                {activeStep.title} (étape {activeStepIndex + 1}/{voteSteps.length})
              </DialogTitle>
              <DialogDescription>{activeStep.description}</DialogDescription>
            </DialogHeader>
            {activeStep.node}
          </>
        )}
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="flex flex-col gap-8">
      <Confetti active={motmCelebration || defenseBossCelebration} />
      {voteModal}

      {isCoach && matchTimeHasPassed && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setConfigOpen((v) => !v)}
        >
          {configOpen ? 'Fermer la configuration' : 'Configurer le match'}
        </Button>
      )}

      {isCoach && matchTimeHasPassed && configOpen ? (
        <div className="flex flex-col gap-8">
          {scoreCard}
          {presenceCard}
          {renderCompositionCard(true)}
          {renderEventsCard(true)}
        </div>
      ) : votesTabApplies ? (
        <div className="flex flex-col gap-8">
          {recapHeader}
          <Tabs defaultValue="resume">
            <TabsList className="mx-auto">
              <TabsTrigger value="resume">Résumé</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
            <TabsContent value="resume" className="flex flex-col gap-8">
              {compositionSummaryView}
            </TabsContent>
            <TabsContent value="stats" className="flex flex-col gap-8">
              {statsTable}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        // Match not played yet: only the score card and "who's available" attendance —
        // the composition is the coach's internal prep and shouldn't leak to players
        // before kickoff. It reappears in the Résumé tab once the match is PLAYED.
        <>
          {scoreCard}
          {presenceCard}
        </>
      )}
    </div>
  )
}
