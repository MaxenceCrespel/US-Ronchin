import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
  subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowRightLeft,
  CalendarX2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Dumbbell,
  History,
  MapPin,
  Pencil,
  Settings2,
  Shuffle,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { MatchResultBadge } from '@/components/MatchResultBadge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_VARIANTS, SUB_POSITION_ABBR, SUB_POSITION_LABELS } from '@/lib/labels'
import { attendanceSegmentClass } from '@/lib/attendance-styles'
import { FootballSpinner } from '@/components/FootballSpinner'
import type {
  Attendance,
  AttendanceStatus,
  AttendanceStatusChangeEntry,
  Match,
  PlayerSubPosition,
  TrainingType,
} from '@/lib/types'
import { isRosterPlayer } from '@/lib/roster'
import { getMatchCategory, MATCH_CATEGORY_BORDER, MATCH_CATEGORY_LABELS } from '@/lib/match-category'
import {
  coachSetAttendance,
  createTraining,
  deleteSession,
  deleteTraining,
  fetchAttendanceHistory,
  fetchAttendances,
  fetchSessions,
  fetchTrainingRanking,
  fetchTrainings,
  setMyAttendance,
  updateSession,
  updateTraining,
  validateAttendance,
} from './api'
import {
  addWalkIn,
  confirmFinalTeams,
  deleteTeams,
  fetchTeams,
  generateTeams,
  moveTeamPlayer,
  removeGuestFromTeam,
} from './teams-api'
import { fetchMatchAttendance, fetchMatches, setMyMatchAttendance } from '@/features/matches/api'
import { fetchPlayers } from '@/features/players/api'

interface GuestNameInput {
  firstName: string
  lastName?: string
  position?: PlayerSubPosition
}

const TEAM_STYLES = ['border-club-blue/30 bg-accent', 'border-red-400/40 bg-red-50']
const TEAM_LABELS = ['Équipe Bleue', 'Équipe Rouge']
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

const SENIORITY_RANK: Record<NonNullable<Attendance['user']['seniorityTier']>, number> = {
  SEVEN_PLUS: 3,
  THREE_TO_SEVEN: 2,
  ONE_TO_THREE: 1,
}

/** Same priorityRank as the backend's attendance-cap.ts — licensed always outranks every
 * non-licensed player, and within "not licensed" a higher seniority bracket outranks a
 * lower one (no tier ranks lowest of all). Kept in sync by hand since this is a display-only
 * mirror, not shared code with the API. */
function priorityRank(user: Attendance['user']): number {
  const seniority = user.seniorityTier ? SENIORITY_RANK[user.seniorityTier] : 0
  return user.isLicensed ? seniority + 4 : seniority
}

/** Orders the attendance badges to actually reflect the waitlist logic (see
 * AttendancesService.setAttendance/pickNextWaitlisted) instead of raw DB order, which only
 * ever reflected each row's first-ever creation time, not later status changes: confirmed
 * PRESENT first by arrival order, then waitlisted PRESENT (by priority — licensed, then
 * seniority bracket — then arrival order, same priority a freed slot would go to), then
 * everyone else. */
function sortAttendancesForDisplay(attendances: Attendance[]): Attendance[] {
  const rank = (a: Attendance) => (a.status === 'PRESENT' ? (a.confirmed ? 0 : 1) : 2)
  return [...attendances].sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    if (rank(a) === 1) {
      const priorityDiff = priorityRank(b.user) - priorityRank(a.user)
      if (priorityDiff !== 0) return priorityDiff
    }
    return new Date(a.respondedAt).getTime() - new Date(b.respondedAt).getTime()
  })
}

export function AttendanceToggle({
  value,
  onChange,
  disabled,
}: {
  value?: AttendanceStatus | null
  onChange: (status: AttendanceStatus) => void
  disabled?: boolean
}) {
  return (
    <div className="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-1">
      {(['PRESENT', 'MAYBE', 'ABSENT'] as AttendanceStatus[]).map((status) => (
        <button
          key={status}
          type="button"
          disabled={disabled}
          onClick={() => onChange(status)}
          className={attendanceSegmentClass(status, value === status)}
        >
          {ATTENDANCE_STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  )
}

function ManageTrainingsDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const trainingsQuery = useQuery({ queryKey: ['trainings'], queryFn: fetchTrainings, enabled: open })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TrainingType>('RECURRING')
  const [location, setLocation] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('2')
  const [startTime, setStartTime] = useState('19:00')
  const [endTime, setEndTime] = useState('20:30')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [maxPresentPlayers, setMaxPresentPlayers] = useState('')

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setType('RECURRING')
    setLocation('')
    setDayOfWeek('2')
    setStartTime('19:00')
    setEndTime('20:30')
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate('')
    setMaxPresentPlayers('')
  }

  function startEdit(training: NonNullable<typeof trainingsQuery.data>[number]) {
    setEditingId(training.id)
    setTitle(training.title)
    setType(training.type)
    setLocation(training.location)
    setDayOfWeek(String(training.dayOfWeek ?? 2))
    setStartTime(training.startTime.slice(0, 5))
    setEndTime(training.endTime.slice(0, 5))
    setStartDate(training.startDate)
    setEndDate(training.endDate ?? '')
    setMaxPresentPlayers(training.maxPresentPlayers != null ? String(training.maxPresentPlayers) : '')
  }

  const formInput = () => ({
    title,
    type,
    location,
    dayOfWeek: type === 'RECURRING' ? Number(dayOfWeek) : undefined,
    startTime,
    endTime,
    startDate,
    endDate: endDate || undefined,
    maxPresentPlayers: maxPresentPlayers ? Number(maxPresentPlayers) : null,
  })

  const createMutation = useMutation({
    mutationFn: () => createTraining(formInput()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] })
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => updateTraining(editingId!, formInput()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] })
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTraining(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] })
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
      if (editingId) resetForm()
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-tour="trainings-manage">
          <Settings2 className="size-4" />
          Gérer les entraînements
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gérer les entraînements</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 flex flex-col gap-4 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-club-blue/10 text-club-blue flex size-8 shrink-0 items-center justify-center rounded-full">
              {editingId ? <Pencil className="size-4" /> : <Dumbbell className="size-4" />}
            </span>
            <h3 className="text-sm font-semibold">
              {editingId ? "Modifier l'entraînement" : 'Nouvel entraînement'}
            </h3>
          </div>
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (editingId) updateMutation.mutate()
              else createMutation.mutate()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                className="bg-background"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TrainingType)}>
                <SelectTrigger className="bg-background w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECURRING">Récurrent (hebdomadaire)</SelectItem>
                  <SelectItem value="ONE_OFF">Ponctuel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Lieu</Label>
              <Input
                id="location"
                className="bg-background"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            {type === 'RECURRING' && (
              <div className="flex flex-col gap-1.5">
                <Label>Jour de la semaine</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startTime">Heure de début</Label>
              <Input
                id="startTime"
                className="bg-background"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endTime">Heure de fin</Label>
              <Input
                id="endTime"
                className="bg-background"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">
                {type === 'RECURRING' ? 'Début de la récurrence' : 'Date'}
              </Label>
              <Input
                id="startDate"
                className="bg-background"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            {type === 'RECURRING' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endDate">Fin de la récurrence (optionnel)</Label>
                <Input
                  id="endDate"
                  className="bg-background"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxPresentPlayers">Nombre de présents max (optionnel)</Label>
              <Input
                id="maxPresentPlayers"
                className="bg-background"
                type="number"
                min={2}
                placeholder="ex. 16 pour du 8v8"
                value={maxPresentPlayers}
                onChange={(e) => setMaxPresentPlayers(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Au-delà, les non-licenciés passent en liste d'attente — les licenciés restent
                prioritaires tant qu'une place est encore libre.
              </p>
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId
                  ? updateMutation.isPending
                    ? 'Enregistrement...'
                    : 'Enregistrer les modifications'
                  : createMutation.isPending
                    ? 'Création...'
                    : "Créer l'entraînement"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Entraînements existants
            {trainingsQuery.data && trainingsQuery.data.length > 0 && (
              <span className="text-muted-foreground ml-1.5 font-normal">
                ({trainingsQuery.data.length})
              </span>
            )}
          </h3>

          {trainingsQuery.data?.length === 0 && (
            <p className="text-muted-foreground rounded-xl border border-dashed py-6 text-center text-sm">
              Aucun entraînement récurrent pour l'instant.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {trainingsQuery.data?.map((training) => (
              <div
                key={training.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3',
                  editingId === training.id && 'border-club-blue bg-club-blue/5',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="bg-club-blue/10 text-club-blue flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Dumbbell className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{training.title}</span>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                      <span>
                        {training.type === 'RECURRING'
                          ? `Chaque ${DAYS[training.dayOfWeek ?? 0]}`
                          : 'Ponctuel'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {training.startTime.slice(0, 5)} - {training.endTime.slice(0, 5)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {training.location}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => startEdit(training)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Supprimer l'entraînement « ${training.title} » ?`)) {
                        deleteMutation.mutate(training.id)
                      }
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TeamsSection({
  sessionId,
  isCoach,
  scoreTeam0,
  scoreTeam1,
}: {
  sessionId: string
  isCoach: boolean
  scoreTeam0: number | null
  scoreTeam1: number | null
}) {
  const queryClient = useQueryClient()
  const teamsQuery = useQuery({ queryKey: ['teams', sessionId], queryFn: () => fetchTeams(sessionId) })
  const [scoreInput0, setScoreInput0] = useState(scoreTeam0 !== null ? String(scoreTeam0) : '')
  const [scoreInput1, setScoreInput1] = useState(scoreTeam1 !== null ? String(scoreTeam1) : '')

  const scoreMutation = useMutation({
    mutationFn: () =>
      updateSession(sessionId, {
        scoreTeam0: Number(scoreInput0),
        scoreTeam1: Number(scoreInput1),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['training-ranking'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => generateTeams(sessionId, 2),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', sessionId] }),
  })

  const deleteTeamsMutation = useMutation({
    mutationFn: () => deleteTeams(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', sessionId] }),
  })

  const moveMutation = useMutation({
    mutationFn: ({ assignmentId, teamIndex }: { assignmentId: string; teamIndex: number }) =>
      moveTeamPlayer(sessionId, assignmentId, teamIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', sessionId] }),
  })

  // Corrects a declared "Présent" that turned out wrong (said they'd come, didn't) so a
  // follow-up "Régénérer" reflects it — bypasses the lock entirely, coach-only.
  const removeMutation = useMutation({
    mutationFn: (userId: string) => coachSetAttendance(sessionId, userId, 'ABSENT'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  // Guests have no status to flip — this removes the slot (and its source AttendanceGuest)
  // outright, so it takes effect immediately instead of waiting for the next
  // Régénérer/Confirmer like the real-player "retirer" above.
  const removeGuestMutation = useMutation({
    mutationFn: (assignmentId: string) => removeGuestFromTeam(sessionId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  const teams = teamsQuery.data ?? []
  // Fixed at TEAM_LABELS.length (generateTeams always creates exactly 2 teams,
  // see the call above) rather than derived from which teamIndex values are
  // currently present — otherwise moving every player out of a team makes it
  // vanish from the assignment rows, and with it the column/drop-target to
  // move anyone back into it.
  const teamCount = teams.length > 0 ? TEAM_LABELS.length : 0

  if (teams.length === 0 && !isCoach) return null

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Équipes {teams.length > 0 ? '' : "(générées 30 min avant le coup d'envoi)"}
        </p>
        {isCoach && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2 text-xs"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              <Shuffle className="size-3.5" />
              {teams.length > 0 ? 'Régénérer' : 'Générer maintenant'}
            </Button>
            {teams.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive h-8 gap-1.5 px-2 text-xs"
                disabled={deleteTeamsMutation.isPending}
                onClick={() => {
                  if (confirm('Supprimer les équipes de cette séance ? Retour à « pas encore générées ».')) {
                    deleteTeamsMutation.mutate()
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                Supprimer
              </Button>
            )}
          </div>
        )}
      </div>
      {generateMutation.isError && (
        <p className="text-destructive text-xs">
          Aucun joueur « Présent » pour générer des équipes.
        </p>
      )}
      {teams.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: teamCount }).map((_, teamIndex) => (
            <div
              key={teamIndex}
              className={cn('rounded-lg border p-2.5', TEAM_STYLES[teamIndex % TEAM_STYLES.length])}
            >
              <p className="mb-1.5 text-sm font-semibold">{TEAM_LABELS[teamIndex] ?? `Équipe ${teamIndex + 1}`}</p>
              <ul className="flex flex-col gap-1">
                {teams
                  .filter((t) => t.teamIndex === teamIndex)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-1.5 py-0.5 text-xs">
                      <span className={cn('truncate', !t.user && 'text-muted-foreground italic')}>
                        {t.user ? `${t.user.firstName} ${t.user.lastName}` : t.guestLabel}
                        {!t.user && t.guestPosition && (
                          <span className="text-muted-foreground"> · {SUB_POSITION_ABBR[t.guestPosition]}</span>
                        )}
                      </span>
                      {isCoach && (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title="Déplacer dans l'autre équipe"
                            aria-label="Déplacer dans l'autre équipe"
                            className="text-muted-foreground hover:text-foreground hover:bg-background flex size-6 items-center justify-center rounded-full transition-colors"
                            onClick={() =>
                              moveMutation.mutate({
                                assignmentId: t.id,
                                teamIndex: (teamIndex + 1) % teamCount,
                              })
                            }
                          >
                            <ArrowRightLeft className="size-3.5" />
                          </button>
                          {t.user ? (
                            <button
                              type="button"
                              title="Ne vient finalement pas"
                              aria-label="Ne vient finalement pas"
                              disabled={removeMutation.isPending}
                              className="text-muted-foreground hover:text-destructive hover:bg-background flex size-6 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                              onClick={() => {
                                if (
                                  confirm(
                                    `${t.user!.firstName} ne vient finalement pas — le marquer absent ?`,
                                  )
                                ) {
                                  removeMutation.mutate(t.user!.id)
                                }
                              }}
                            >
                              <UserMinus className="size-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Retirer cet invité"
                              aria-label="Retirer cet invité"
                              disabled={removeGuestMutation.isPending}
                              className="text-muted-foreground hover:text-destructive hover:bg-background flex size-6 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                              onClick={() => {
                                if (confirm(`Retirer ${t.guestLabel} de l'équipe ?`)) {
                                  removeGuestMutation.mutate(t.id)
                                }
                              }}
                            >
                              <UserMinus className="size-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {teams.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Trophy className="text-muted-foreground size-3.5 shrink-0" />
          {isCoach ? (
            <>
              <Input
                type="number"
                min={0}
                value={scoreInput0}
                onChange={(e) => setScoreInput0(e.target.value)}
                className="h-7 w-14 px-2 text-center"
                placeholder="—"
                aria-label={`Score ${TEAM_LABELS[0]}`}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                min={0}
                value={scoreInput1}
                onChange={(e) => setScoreInput1(e.target.value)}
                className="h-7 w-14 px-2 text-center"
                placeholder="—"
                aria-label={`Score ${TEAM_LABELS[1]}`}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={scoreInput0 === '' || scoreInput1 === '' || scoreMutation.isPending}
                onClick={() => scoreMutation.mutate()}
              >
                {scoreMutation.isPending ? 'Enregistrement...' : 'Enregistrer le score'}
              </Button>
            </>
          ) : scoreTeam0 !== null && scoreTeam1 !== null ? (
            <span className="text-muted-foreground">
              Score : {TEAM_LABELS[0]} {scoreTeam0} – {scoreTeam1} {TEAM_LABELS[1]}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Chronological trail of every declared-status change for a session — see
 * AttendanceStatusChange. Exists to settle "I never touched it" disputes (e.g. a player
 * ending up on the waitlist despite believing their status never changed) with actual
 * evidence instead of guessing from the current state alone. */
function AttendanceHistoryDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const historyQuery = useQuery({
    queryKey: ['attendance-history', sessionId],
    queryFn: () => fetchAttendanceHistory(sessionId),
    enabled: open,
  })

  function describe(entry: AttendanceStatusChangeEntry): string {
    const from = entry.previousStatus ? ATTENDANCE_STATUS_LABELS[entry.previousStatus] : 'Aucune réponse'
    const to = ATTENDANCE_STATUS_LABELS[entry.newStatus]
    const isSelf = entry.changedBy === entry.userId
    const actor = isSelf ? null : `${entry.changer.firstName} ${entry.changer.lastName[0]}.`
    const notes: string[] = []
    if (entry.previousConfirmed !== entry.newConfirmed) {
      notes.push(entry.newConfirmed ? "passé de liste d'attente à confirmé" : "mis en liste d'attente")
    }
    const guestDiff = entry.newConfirmedGuestCount - entry.previousConfirmedGuestCount
    if (guestDiff > 0) {
      notes.push(`${guestDiff} invité${guestDiff > 1 ? 's' : ''} confirmé${guestDiff > 1 ? 's' : ''} en plus`)
    } else if (guestDiff < 0) {
      notes.push(`${-guestDiff} invité${-guestDiff > 1 ? 's' : ''} repassé${-guestDiff > 1 ? 's' : ''} en attente`)
    }
    const noteText = notes.length > 0 ? ` — ${notes.join(', ')}` : ''
    if (from === to && !isSelf) {
      // The auto-promotion case: status doesn't change, only confirmed/guests do.
      return `Mis à jour depuis la liste d'attente${noteText}`
    }
    return `${from} → ${to}${noteText}${actor ? ` (par ${actor}, coach)` : ''}`
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <History className="size-3.5" />
          Historique
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique des réponses</DialogTitle>
        </DialogHeader>
        {historyQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : !historyQuery.data || historyQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun changement enregistré.</p>
        ) : (
          <ul className="flex flex-col gap-2.5 text-sm">
            {historyQuery.data.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5">
                <span className="text-muted-foreground w-12 shrink-0 text-xs">
                  {format(new Date(entry.createdAt), 'HH:mm')}
                </span>
                <span>
                  <strong className="font-medium">
                    {entry.user.firstName} {entry.user.lastName}
                  </strong>{' '}
                  <span className="text-muted-foreground">{describe(entry)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Post-training coach checklist, in its own dialog rather than a cramped inline panel —
 * gives the list room to breathe (avatars, full names, bigger tap targets) and a "Tout
 * présent" bulk action, since most sessions the whole declared list actually did show up. */
function CoachValidationDialog({
  sessionId,
  attendances,
}: {
  sessionId: string
  attendances: Attendance[]
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  // Not gated on `open` (unlike most on-demand dialog queries elsewhere in this file) —
  // the trigger button needs the roster to show its "X/Y pointés" progress before the
  // coach ever opens it. React Query dedupes this against any other ['players'] fetch
  // already in flight for the page, so it's not an extra request per card in practice.
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })

  const validateMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: AttendanceStatus }) =>
      validateAttendance(sessionId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  const bulkPresentMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      Promise.all(userIds.map((userId) => validateAttendance(sessionId, userId, 'PRESENT'))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  // Shares its cache with TeamsSection's identical query key — just here to know whether
  // teams exist yet, so "Confirmer l'équipe finale" only shows once there's something to
  // reconcile against.
  const teamsQuery = useQuery({ queryKey: ['teams', sessionId], queryFn: () => fetchTeams(sessionId) })

  const confirmTeamsMutation = useMutation({
    mutationFn: () => confirmFinalTeams(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['training-ranking'] })
    },
  })

  // Someone who showed up without being on the original list at all — no account (can't
  // have declared PRESENT themselves) and nobody registered them as a guest either.
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInFirstName, setWalkInFirstName] = useState('')
  const [walkInLastName, setWalkInLastName] = useState('')
  const [walkInPosition, setWalkInPosition] = useState<PlayerSubPosition | ''>('')
  const walkInMutation = useMutation({
    mutationFn: () =>
      addWalkIn(sessionId, {
        firstName: walkInFirstName.trim(),
        lastName: walkInLastName.trim() || undefined,
        position: walkInPosition || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', sessionId] })
      setWalkInFirstName('')
      setWalkInLastName('')
      setWalkInPosition('')
      setWalkInOpen(false)
    },
  })

  // A non-playing coach isn't a "roster player" and would otherwise never see themselves
  // here — but a coach who actually attended still needs to be able to point themselves.
  const rosterPlayers = (playersQuery.data ?? []).filter((p) => isRosterPlayer(p))
  const me = playersQuery.data?.find((p) => p.id === currentUser?.id)
  const players =
    me && !rosterPlayers.some((p) => p.id === me.id) ? [me, ...rosterPlayers] : rosterPlayers

  const actualByUserId = new Map(
    attendances.map((a) => [a.userId, a.actualStatus ?? null] as const),
  )
  const pointedCount = players.filter((p) => actualByUserId.get(p.id)).length
  const allPointed = players.length > 0 && pointedCount === players.length
  const unpointedIds = players.filter((p) => !actualByUserId.get(p.id)).map((p) => p.id)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 justify-start gap-2 text-xs',
            allPointed ? 'border-emerald-500/40 text-emerald-700' : '',
          )}
        >
          <ClipboardCheck className="size-3.5" />
          Pointage réel
          {players.length > 0 && (
            <Badge variant={allPointed ? 'default' : 'secondary'} className="ml-auto">
              {pointedCount}/{players.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pointage réel</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {allPointed && (teamsQuery.data?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-2">
              <p className="text-muted-foreground text-xs">
                Pointage terminé — confirme l'équipe finale pour retirer les absents de
                dernière minute et ajouter ceux qui sont venus sans être prévus.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5 self-start"
                disabled={confirmTeamsMutation.isPending}
                onClick={() => confirmTeamsMutation.mutate()}
              >
                <CheckCheck className="size-3.5" />
                {confirmTeamsMutation.isPending
                  ? 'Confirmation...'
                  : "Confirmer l'équipe finale"}
              </Button>
              {confirmTeamsMutation.isSuccess && (
                <p className="text-xs text-emerald-600">Équipes mises à jour ✓</p>
              )}
            </div>
          )}
          {(teamsQuery.data?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-2">
              {!walkInOpen ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 self-start text-xs"
                  onClick={() => setWalkInOpen(true)}
                >
                  <UserPlus className="size-3.5" />
                  Ajouter quelqu'un qui n'était pas prévu
                </Button>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">
                    Personne sans compte ni invité déclaré, mais bien venue — s'ajoute
                    directement à l'équipe la moins fournie.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      placeholder="Prénom"
                      className="h-7 w-24 text-xs"
                      value={walkInFirstName}
                      onChange={(e) => setWalkInFirstName(e.target.value)}
                    />
                    <Input
                      placeholder="Nom (optionnel)"
                      className="h-7 w-28 text-xs"
                      value={walkInLastName}
                      onChange={(e) => setWalkInLastName(e.target.value)}
                    />
                    <Select
                      value={walkInPosition}
                      onValueChange={(v) => setWalkInPosition(v as PlayerSubPosition)}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue placeholder="Poste (optionnel)" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SUB_POSITION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={walkInMutation.isPending || !walkInFirstName.trim()}
                      onClick={() => walkInMutation.mutate()}
                    >
                      {walkInMutation.isPending ? 'Ajout...' : 'Ajouter'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setWalkInOpen(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                  {walkInMutation.isError && (
                    <p className="text-destructive text-xs">Échec — réessaie.</p>
                  )}
                </>
              )}
            </div>
          )}
          {unpointedIds.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5 self-start"
              disabled={bulkPresentMutation.isPending}
              onClick={() => bulkPresentMutation.mutate(unpointedIds)}
            >
              <CheckCheck className="size-3.5" />
              {bulkPresentMutation.isPending
                ? 'Enregistrement...'
                : `Tout présent (${unpointedIds.length} restant${unpointedIds.length > 1 ? 's' : ''})`}
            </Button>
          )}
          <div className="flex flex-col divide-y">
            {players.map((player) => {
              const declared = attendances.find((a) => a.userId === player.id)
              const actual = declared?.actualStatus ?? null
              const mismatch = declared?.status && actual && declared.status !== actual

              return (
                <div key={player.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlayerAvatar
                      firstName={player.firstName}
                      lastName={player.lastName}
                      avatarUrl={player.avatarUrl}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {player.firstName} {player.lastName}
                      </span>
                      {declared?.status && (
                        <span
                          className={cn(
                            'text-muted-foreground text-xs',
                            mismatch && 'text-amber-600',
                          )}
                        >
                          Déclaré {ATTENDANCE_STATUS_LABELS[declared.status].toLowerCase()}
                          {mismatch && ' — à vérifier'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={validateMutation.isPending || bulkPresentMutation.isPending}
                      onClick={() => validateMutation.mutate({ userId: player.id, status: 'PRESENT' })}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border transition-colors',
                        actual === 'PRESENT'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-muted-foreground/30 text-muted-foreground hover:border-emerald-500 hover:text-emerald-600',
                      )}
                      aria-label="Marquer présent"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={validateMutation.isPending || bulkPresentMutation.isPending}
                      onClick={() => validateMutation.mutate({ userId: player.id, status: 'ABSENT' })}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border transition-colors',
                        actual === 'ABSENT'
                          ? 'border-destructive bg-destructive text-white'
                          : 'border-muted-foreground/30 text-muted-foreground hover:border-destructive hover:text-destructive',
                      )}
                      aria-label="Marquer absent"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SessionCard({
  sessionId,
  date,
  startTime,
  endTime,
  location,
  cancelled,
  scoreTeam0 = null,
  scoreTeam1 = null,
  trainingType = null,
  maxPresentPlayers = null,
  inDialog,
}: {
  sessionId: string
  date: string
  startTime: string
  endTime: string
  location: string
  cancelled: boolean
  scoreTeam0?: number | null
  scoreTeam1?: number | null
  trainingType?: TrainingType | null
  maxPresentPlayers?: number | null
  inDialog?: boolean
}) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(currentUser)
  const [editing, setEditing] = useState(false)
  const [editDate, setEditDate] = useState(date)
  const [editStartTime, setEditStartTime] = useState(startTime.slice(0, 5))
  const [editEndTime, setEditEndTime] = useState(endTime.slice(0, 5))
  const [editLocation, setEditLocation] = useState(location)
  // Only a ONE_OFF training's cap can be edited from right here — a session doesn't own
  // this field (it lives on the Training template, see TrainingSessionWithTraining), and
  // for a RECURRING training editing it from a single week would silently change the whole
  // series, so that stays exclusively in "Gérer les entraînements". A ONE_OFF has no
  // separate "series" screen to reach for, so this card is the only realistic place.
  const [editMaxPresentPlayers, setEditMaxPresentPlayers] = useState(
    maxPresentPlayers != null ? String(maxPresentPlayers) : '',
  )

  const attendancesQuery = useQuery({
    queryKey: ['attendances', sessionId],
    queryFn: () => fetchAttendances(sessionId),
  })

  const mutation = useMutation({
    mutationFn: (vars: { status: AttendanceStatus; guests: GuestNameInput[] }) =>
      setMyAttendance(sessionId, vars.status, vars.guests),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendances', sessionId] })
    },
  })

  const invalidateSessions = () => {
    queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
  }

  const updateSessionMutation = useMutation({
    mutationFn: () =>
      updateSession(sessionId, {
        date: editDate,
        startTime: editStartTime,
        endTime: editEndTime,
        location: editLocation,
        maxPresentPlayersOverride: editMaxPresentPlayers ? Number(editMaxPresentPlayers) : null,
      }),
    onSuccess: () => {
      invalidateSessions()
      setEditing(false)
    },
  })

  const deleteSessionMutation = useMutation({
    mutationFn: () => deleteSession(sessionId),
    onSuccess: invalidateSessions,
  })

  // Attendance is locked from 30 min before kickoff — the same moment teams get
  // auto-generated. Distinct from isPast (the "Terminé" badge below): that one only cares
  // whether the session has actually started, not the earlier lock threshold.
  const isPast = new Date(`${date}T${startTime}`).getTime() <= Date.now()
  const hasStarted = new Date(`${date}T${startTime}`).getTime() - 30 * 60_000 <= Date.now()

  const myAttendance = attendancesQuery.data?.find((a) => a.userId === currentUser?.id)
  const [guests, setGuests] = useState<GuestNameInput[]>([])
  const [newGuestFirstName, setNewGuestFirstName] = useState('')
  const [newGuestLastName, setNewGuestLastName] = useState('')
  const [newGuestPosition, setNewGuestPosition] = useState<PlayerSubPosition | ''>('')
  useEffect(() => {
    setGuests(
      myAttendance?.guests.map((g) => ({ firstName: g.firstName, lastName: g.lastName ?? undefined })) ??
        [],
    )
  }, [myAttendance?.guests])

  const dimmed = cancelled || isPast

  return (
    <Card
      className={cn(
        'gap-4 overflow-hidden rounded-2xl border-l-4 py-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        dimmed ? 'bg-muted border-muted-foreground/30' : 'border-club-blue/70',
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                dimmed
                  ? 'bg-background text-muted-foreground'
                  : 'bg-club-blue/10 text-club-blue animate-net-wobble',
              )}
            >
              <Dumbbell className="size-4.5" />
            </span>
            <span className={cn('text-base font-semibold', dimmed && 'text-muted-foreground')}>
              Entraînement
            </span>
          </div>
          <div className={cn('flex items-center gap-1.5', inDialog && 'mr-5')}>
            {cancelled ? (
              <Badge variant="destructive">Annulée</Badge>
            ) : (
              isPast && <Badge variant="secondary">Terminé</Badge>
            )}
            {isCoach && !editing && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => setEditing(true)}
                  aria-label="Modifier"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive size-7"
                  disabled={deleteSessionMutation.isPending}
                  onClick={() => {
                    if (confirm('Supprimer cet entraînement ?')) deleteSessionMutation.mutate()
                  }}
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardTitle>
        {editing ? (
          <form
            className="flex flex-col gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault()
              updateSessionMutation.mutate()
            }}
          >
            <div className="flex gap-2">
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                required
              />
              <Input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                required
              />
            </div>
            <Input
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              placeholder="Lieu"
              required
            />
            <div className="flex flex-col gap-1">
              <Input
                type="number"
                min={2}
                placeholder="Nombre de présents max pour cette séance (optionnel)"
                value={editMaxPresentPlayers}
                onChange={(e) => setEditMaxPresentPlayers(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {trainingType === 'RECURRING'
                  ? "Ne change que cette séance, pas le reste de la série — vide pour reprendre la valeur par défaut du modèle."
                  : "Au-delà, les non-licenciés passent en liste d'attente."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={updateSessionMutation.isPending}>
                {updateSessionMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pl-11.5 text-sm capitalize">
            <span>{formatDate(date)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {startTime.slice(0, 5)} - {endTime.slice(0, 5)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {location}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!cancelled && (
          <div className="flex flex-col gap-2" data-tour="attendance-toggle">
            <AttendanceToggle
              value={myAttendance?.status}
              disabled={mutation.isPending || hasStarted}
              onChange={(status) => {
                // Guests aren't wiped on a status change anymore — a friend can still come
                // even if you end up Absent/Incertain yourself, so there's no reason to
                // force them out just because your own answer changed.
                mutation.mutate({ status, guests })
              }}
            />
            {hasStarted && (
              <p className="text-muted-foreground text-xs">
                Les équipes ont été générées — la présence ne peut plus être modifiée.
              </p>
            )}
            {mutation.isError && (
              <p className="text-destructive text-xs">Échec — réessaie.</p>
            )}
            {myAttendance?.status === 'PRESENT' && !myAttendance.confirmed && (
              <p className="text-amber-600 text-xs font-medium">
                Séance complète — tu es sur liste d'attente, tu seras confirmé automatiquement
                si une place se libère.
              </p>
            )}
            {myAttendance?.status && (
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">
                  Quelqu'un vient avec toi (ou à ta place) ?
                </span>
                {guests.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {guests.map((g, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="bg-muted/60 rounded-full px-2 py-1">
                          {g.firstName}
                          {g.lastName ? ` ${g.lastName}` : ''}
                          {g.position && (
                            <span className="text-muted-foreground"> · {SUB_POSITION_ABBR[g.position]}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={mutation.isPending || hasStarted}
                          onClick={() => {
                            const next = guests.filter((_, idx) => idx !== i)
                            setGuests(next)
                            mutation.mutate({ status: myAttendance!.status!, guests: next })
                          }}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                          aria-label="Retirer cet invité"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    placeholder="Prénom"
                    className="h-7 w-24 text-xs"
                    disabled={hasStarted}
                    value={newGuestFirstName}
                    onChange={(e) => setNewGuestFirstName(e.target.value)}
                  />
                  <Input
                    placeholder="Nom (optionnel)"
                    className="h-7 w-28 text-xs"
                    disabled={hasStarted}
                    value={newGuestLastName}
                    onChange={(e) => setNewGuestLastName(e.target.value)}
                  />
                  <Select
                    value={newGuestPosition}
                    onValueChange={(v) => setNewGuestPosition(v as PlayerSubPosition)}
                    disabled={hasStarted}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue placeholder="Poste (optionnel)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUB_POSITION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={mutation.isPending || hasStarted || !newGuestFirstName.trim()}
                    onClick={() => {
                      const next = [
                        ...guests,
                        {
                          firstName: newGuestFirstName.trim(),
                          lastName: newGuestLastName.trim() || undefined,
                          position: newGuestPosition || undefined,
                        },
                      ]
                      setGuests(next)
                      setNewGuestFirstName('')
                      setNewGuestLastName('')
                      setNewGuestPosition('')
                      mutation.mutate({ status: myAttendance!.status!, guests: next })
                    }}
                  >
                    Ajouter
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {attendancesQuery.data && attendancesQuery.data.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sortAttendancesForDisplay(attendancesQuery.data)
              .filter((a) => a.status)
              .flatMap((a) => [
                <Badge
                  key={a.id}
                  variant={a.confirmed ? ATTENDANCE_STATUS_VARIANTS[a.status!] : 'outline'}
                  className="animate-pop-in"
                >
                  {a.user.firstName} {a.user.lastName[0]}.
                  {!a.confirmed && ' (attente)'}
                </Badge>,
                // Each guest gets its own badge — a "+2" tucked into the inviter's own badge
                // read as an afterthought, not as someone who's actually coming and counts
                // toward the headcount/cap exactly like a real player.
                ...a.guests.map((g, i) => {
                  const guestConfirmed = a.confirmed && i < a.confirmedGuestCount
                  return (
                    <Badge
                      key={`${a.id}-guest-${g.id}`}
                      variant={guestConfirmed ? ATTENDANCE_STATUS_VARIANTS.PRESENT : 'outline'}
                      className="animate-pop-in"
                    >
                      {g.firstName}
                      {g.lastName ? ` ${g.lastName}` : ''}
                      <span className={guestConfirmed ? 'text-white/80' : 'text-muted-foreground'}>
                        {' '}
                        · invité de {a.user.firstName}
                      </span>
                      {!guestConfirmed && ' (attente)'}
                    </Badge>
                  )
                }),
              ])}
          </div>
        )}
        {(() => {
          const presentAttendances = attendancesQuery.data?.filter((a) => a.status === 'PRESENT') ?? []
          const confirmedCount = presentAttendances.filter((a) => a.confirmed).length
          const waitlistedPlayerCount = presentAttendances.length - confirmedCount
          // Guests count regardless of the inviting player's own status — they can still
          // show up even if whoever registered them ends up not coming themselves. Split the
          // same way as players — confirmedGuestCount is the cap-respecting figure, the rest
          // (guestCount - confirmedGuestCount) is waitlisted right alongside the player.
          const guestTotal = attendancesQuery.data?.reduce((sum, a) => sum + a.confirmedGuestCount, 0) ?? 0
          const waitlistedGuestTotal =
            attendancesQuery.data?.reduce((sum, a) => sum + (a.guestCount - a.confirmedGuestCount), 0) ?? 0
          const waitlistedCount = waitlistedPlayerCount + waitlistedGuestTotal
          if (confirmedCount === 0 && guestTotal === 0) return null
          return (
            <p className="text-muted-foreground text-xs">
              {confirmedCount} joueur{confirmedCount > 1 ? 's' : ''}
              {guestTotal > 0 && (
                <>
                  {' '}
                  + {guestTotal} invité{guestTotal > 1 ? 's' : ''}
                </>
              )}
              {' = '}
              <strong className="text-foreground">{confirmedCount + guestTotal} sur le terrain</strong>
              {waitlistedCount > 0 && (
                <>
                  {' · '}
                  {waitlistedCount} en liste d'attente
                </>
              )}
            </p>
          )
        })()}
        {!cancelled && isCoach && (
          // Coach-only actions get their own tinted block, set apart from the self-service
          // attendance controls above — previously the pointage trigger was a tiny
          // collapsed text link buried at the bottom of an otherwise undifferentiated stack.
          <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              Espace coach
            </p>
            <div className="flex flex-wrap gap-2">
              <CoachValidationDialog sessionId={sessionId} attendances={attendancesQuery.data ?? []} />
              <AttendanceHistoryDialog sessionId={sessionId} />
            </div>
          </div>
        )}
        {!cancelled && (
          <TeamsSection
            sessionId={sessionId}
            isCoach={isCoach}
            scoreTeam0={scoreTeam0}
            scoreTeam1={scoreTeam1}
          />
        )}
      </CardContent>
    </Card>
  )
}

export function MatchCard({ match, inDialog }: { match: Match; inDialog?: boolean }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const attendanceQuery = useQuery({
    queryKey: ['match-attendance', match.id],
    queryFn: () => fetchMatchAttendance(match.id),
  })

  const mutation = useMutation({
    mutationFn: (vars: { status: AttendanceStatus; guests: GuestNameInput[] }) =>
      setMyMatchAttendance(match.id, vars.status, vars.guests),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match-attendance', match.id] }),
  })

  const myAttendance = attendanceQuery.data?.find((a) => a.userId === currentUser?.id)
  const played = match.status === 'PLAYED'
  const hasKickedOff =
    new Date(`${match.date}T${match.kickOffTime ?? '00:00:00'}`).getTime() <= Date.now()
  const category = getMatchCategory(match)
  const dimmed = !played && hasKickedOff

  // Guests only make sense for a friendly — an officially licensed match can't field an
  // informal +1 (see MatchesService.setMyAttendance).
  const isFriendly = match.source === 'FRIENDLY'
  const [guests, setGuests] = useState<GuestNameInput[]>([])
  const [newGuestFirstName, setNewGuestFirstName] = useState('')
  const [newGuestLastName, setNewGuestLastName] = useState('')
  useEffect(() => {
    setGuests(
      myAttendance?.guests.map((g) => ({ firstName: g.firstName, lastName: g.lastName ?? undefined })) ??
        [],
    )
  }, [myAttendance?.guests])

  const presentCount = attendanceQuery.data?.filter((a) => a.status === 'PRESENT').length ?? 0
  const guestTotal = attendanceQuery.data?.reduce((sum, a) => sum + a.guestCount, 0) ?? 0

  return (
    <Card
      className={cn(
        'gap-4 overflow-hidden rounded-2xl border-l-4 py-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        dimmed ? 'bg-muted border-muted-foreground/30' : MATCH_CATEGORY_BORDER[category],
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                dimmed
                  ? 'bg-background text-muted-foreground'
                  : 'bg-club-gold/15 text-amber-700 animate-net-wobble',
              )}
            >
              <Trophy className="size-4.5" />
            </span>
            <span className={cn('text-base font-semibold', dimmed && 'text-muted-foreground')}>
              vs {match.opponent}
            </span>
          </div>
          <div className={cn('flex items-center gap-1.5', inDialog && 'mr-5')}>
            {dimmed && <Badge variant="secondary">Terminé</Badge>}
            <Badge variant="outline">{MATCH_CATEGORY_LABELS[category]}</Badge>
          </div>
        </CardTitle>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pl-11.5 text-sm">
          {match.kickOffTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {match.kickOffTime.slice(0, 5)}
            </span>
          )}
          <span>{match.homeAway === 'HOME' ? 'Domicile' : 'Extérieur'}</span>
          {match.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {match.venue}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {played ? (
          <p className="animate-pop-in flex items-center gap-2 text-2xl font-semibold">
            {match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}
            <MatchResultBadge match={match} />
          </p>
        ) : (
          <>
            <AttendanceToggle
              value={myAttendance?.status}
              disabled={mutation.isPending || hasKickedOff}
              onChange={(status) => mutation.mutate({ status, guests })}
            />
            {hasKickedOff && (
              <p className="text-muted-foreground text-xs">
                Le match a commencé — la présence ne peut plus être modifiée.
              </p>
            )}
            {mutation.isError && (
              <p className="text-destructive text-xs">Échec — réessaie.</p>
            )}
            {isFriendly && myAttendance?.status && (
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">
                  Quelqu'un vient avec toi (ou à ta place) ?
                </span>
                {guests.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {guests.map((g, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="bg-muted/60 rounded-full px-2 py-1">
                          {g.firstName}
                          {g.lastName ? ` ${g.lastName}` : ''}
                        </span>
                        <button
                          type="button"
                          disabled={mutation.isPending || hasKickedOff}
                          onClick={() => {
                            const next = guests.filter((_, idx) => idx !== i)
                            setGuests(next)
                            mutation.mutate({ status: myAttendance!.status!, guests: next })
                          }}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                          aria-label="Retirer cet invité"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    placeholder="Prénom"
                    className="h-7 w-24 text-xs"
                    disabled={hasKickedOff}
                    value={newGuestFirstName}
                    onChange={(e) => setNewGuestFirstName(e.target.value)}
                  />
                  <Input
                    placeholder="Nom (optionnel)"
                    className="h-7 w-28 text-xs"
                    disabled={hasKickedOff}
                    value={newGuestLastName}
                    onChange={(e) => setNewGuestLastName(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={mutation.isPending || hasKickedOff || !newGuestFirstName.trim()}
                    onClick={() => {
                      const next = [
                        ...guests,
                        { firstName: newGuestFirstName.trim(), lastName: newGuestLastName.trim() || undefined },
                      ]
                      setGuests(next)
                      setNewGuestFirstName('')
                      setNewGuestLastName('')
                      mutation.mutate({ status: myAttendance!.status!, guests: next })
                    }}
                  >
                    Ajouter
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {attendanceQuery.data && attendanceQuery.data.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attendanceQuery.data.map((a) => (
              <Badge key={a.id} variant={ATTENDANCE_STATUS_VARIANTS[a.status]} className="animate-pop-in">
                {a.user.firstName} {a.user.lastName[0]}.
                {a.guests.length > 0 && ` +${a.guests.map((g) => g.firstName).join(', ')}`}
              </Badge>
            ))}
          </div>
        )}
        {(presentCount > 0 || guestTotal > 0) && (
          <p className="text-muted-foreground text-xs">
            {presentCount} joueur{presentCount > 1 ? 's' : ''}
            {guestTotal > 0 && (
              <>
                {' '}
                + {guestTotal} invité{guestTotal > 1 ? 's' : ''}
              </>
            )}
            {' = '}
            <strong className="text-foreground">{presentCount + guestTotal} sur le terrain</strong>
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Link to={`/matches/${match.id}`} className="text-club-blue text-sm hover:underline">
          Voir la fiche du match →
        </Link>
      </CardFooter>
    </Card>
  )
}

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

/** Classement des matchs d'entraînement — points cumulés sur toutes les séances où un
 * score a été saisi (voir TeamsSection). Repliée par défaut, tout le monde peut la voir. */
function TrainingRankingCard() {
  const [open, setOpen] = useState(false)
  const rankingQuery = useQuery({
    queryKey: ['training-ranking'],
    queryFn: fetchTrainingRanking,
    enabled: open,
  })
  const ranking = rankingQuery.data ?? []

  return (
    <Card className="rounded-2xl py-4 shadow-sm">
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold"
        >
          <Trophy className="size-4 text-amber-500" />
          Classement des matchs d'entraînement
        </button>
        {open &&
          (rankingQuery.isLoading ? (
            <FootballSpinner />
          ) : ranking.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Aucun score de match d'entraînement enregistré pour l'instant.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Joueur</th>
                    <th className="py-1 pr-2 text-right">Pts</th>
                    <th className="py-1 pr-2 text-right">J</th>
                    <th className="py-1 pr-2 text-right">V</th>
                    <th className="py-1 pr-2 text-right">N</th>
                    <th className="py-1 text-right">D</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => (
                    <tr key={entry.userId} className="border-t">
                      <td className="text-muted-foreground py-1 pr-2">{index + 1}</td>
                      <td className="py-1 pr-2 font-medium">
                        {entry.firstName} {entry.lastName}
                      </td>
                      <td className="py-1 pr-2 text-right font-semibold">{entry.points}</td>
                      <td className="text-muted-foreground py-1 pr-2 text-right">
                        {entry.sessionsPlayed}
                      </td>
                      <td className="text-muted-foreground py-1 pr-2 text-right">{entry.wins}</td>
                      <td className="text-muted-foreground py-1 pr-2 text-right">{entry.draws}</td>
                      <td className="text-muted-foreground py-1 text-right">{entry.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}

export function TrainingsPage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)

  const todayKey = toDateKey(new Date())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  )

  const sessionsQuery = useQuery({
    queryKey: ['training-sessions', toDateKey(weekStart), toDateKey(weekEnd)],
    queryFn: () => fetchSessions(toDateKey(weekStart), toDateKey(weekEnd)),
  })

  const matchesQuery = useQuery({ queryKey: ['matches'], queryFn: fetchMatches })
  const weekMatches = useMemo(() => {
    const startKey = toDateKey(weekStart)
    const endKey = toDateKey(weekEnd)
    return (matchesQuery.data ?? []).filter((m) => m.date >= startKey && m.date <= endKey)
  }, [matchesQuery.data, weekStart, weekEnd])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof sessionsQuery.data>>()
    for (const session of sessionsQuery.data ?? []) {
      const list = map.get(session.date) ?? []
      list.push(session)
      map.set(session.date, list)
    }
    return map
  }, [sessionsQuery.data])

  const matchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>()
    for (const match of weekMatches) {
      const list = map.get(match.date) ?? []
      list.push(match)
      map.set(match.date, list)
    }
    return map
  }, [weekMatches])

  const selectedSessions = sessionsByDate.get(selectedDate) ?? []
  const selectedMatches = matchesByDate.get(selectedDate) ?? []

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const activeSession = (sessionsQuery.data ?? []).find((s) => s.id === activeSessionId) ?? null
  const activeMatch = (matchesQuery.data ?? []).find((m) => m.id === activeMatchId) ?? null

  // Deep link from elsewhere (e.g. the home page's "Programme de la semaine") straight to
  // one training's detail dialog, instead of just landing on this page generically.
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkSessionId = searchParams.get('session')

  // sessionsQuery only ever covers the currently displayed week — a target session from a
  // different week (e.g. next week's) is never in sessionsQuery.data, so the effect below
  // used to silently no-op forever. This unscoped lookup (only runs while a deep link is
  // pending) finds the session regardless of week so its week can be jumped to first.
  const deepLinkLookupQuery = useQuery({
    queryKey: ['training-sessions', 'deep-link', deepLinkSessionId],
    queryFn: () => fetchSessions(),
    enabled: !!deepLinkSessionId,
  })

  useEffect(() => {
    if (!deepLinkSessionId || !deepLinkLookupQuery.data) return
    const target = deepLinkLookupQuery.data.find((s) => s.id === deepLinkSessionId)
    if (!target) return
    setWeekStart(startOfWeek(new Date(`${target.date}T00:00:00`), { weekStartsOn: 1 }))
    setSelectedDate(target.date)
    setActiveSessionId(target.id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('session')
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkSessionId, deepLinkLookupQuery.data])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Entraînements &amp; matchs</h1>
        {isCoach && <ManageTrainingsDialog />}
      </div>

      <TrainingRankingCard />

      <Card className="min-w-0 rounded-2xl py-5 shadow-sm" data-tour="trainings-calendar">
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold capitalize">
              {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
                  setSelectedDate(todayKey)
                }}
              >
                Aujourd'hui
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setWeekStart((d) => subWeeks(d, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setWeekStart((d) => addWeeks(d, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[620px] grid-cols-7 gap-2 sm:min-w-0">
            {weekDays.map((day) => {
              const key = toDateKey(day)
              const daySessions = sessionsByDate.get(key) ?? []
              const dayMatches = matchesByDate.get(key) ?? []
              const selected = isSameDay(day, new Date(`${selectedDate}T00:00:00`))
              const today = isToday(day)

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  data-tour={daySessions.length > 0 ? 'training-day-with-session' : undefined}
                  onClick={() => setSelectedDate(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedDate(key)
                  }}
                  className={cn(
                    'flex min-h-32 cursor-pointer flex-col items-stretch gap-1.5 rounded-xl border p-2 text-left align-top transition-all duration-150',
                    selected
                      ? 'border-club-blue bg-club-blue shadow-md'
                      : 'border-transparent bg-muted/40 hover:bg-muted/70',
                    today && !selected && 'ring-club-blue/60 ring-2',
                  )}
                >
                  <span
                    className={cn(
                      'text-center text-[11px] font-semibold tracking-wide uppercase',
                      selected ? 'text-white/80' : 'text-muted-foreground',
                    )}
                  >
                    {format(day, 'EEE', { locale: fr })}
                  </span>
                  <span
                    className={cn(
                      'mx-auto flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                      selected
                        ? 'bg-white text-club-blue-dark'
                        : today
                          ? 'bg-club-blue text-white'
                          : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="flex flex-col gap-1">
                    {daySessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveSessionId(s.id)
                        }}
                        className={cn(
                          'flex items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-left text-[10px] font-medium transition-all duration-150 hover:scale-105',
                          s.cancelled
                            ? 'bg-muted text-muted-foreground line-through'
                            : selected
                              ? 'bg-white/20 text-white hover:bg-white/30'
                              : 'bg-club-blue/15 text-club-blue-dark hover:bg-club-blue/25',
                        )}
                      >
                        <Dumbbell className="size-2.5 shrink-0" />
                        {s.startTime.slice(0, 5)}
                      </button>
                    ))}
                    {dayMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveMatchId(m.id)
                        }}
                        className={cn(
                          'flex items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-left text-[10px] font-medium transition-all duration-150 hover:scale-105',
                          selected
                            ? 'bg-white/20 text-white hover:bg-white/30'
                            : 'bg-club-gold/25 text-amber-900 hover:bg-club-gold/40',
                        )}
                      >
                        <Trophy className="size-2.5 shrink-0" />
                        <span className="truncate">vs {m.opponent}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-sm font-semibold capitalize">
          {format(new Date(`${selectedDate}T00:00:00`), 'EEEE d MMMM yyyy', { locale: fr })}
        </h2>
        {sessionsQuery.isLoading || matchesQuery.isLoading ? (
          <FootballSpinner />
        ) : selectedSessions.length === 0 && selectedMatches.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-sm">
            <CalendarX2 className="size-6 opacity-60" />
            Rien de prévu ce jour-là.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectedSessions.map((session) => (
              <SessionCard
                key={session.id}
                sessionId={session.id}
                date={session.date}
                startTime={session.startTime}
                endTime={session.endTime}
                location={session.location}
                cancelled={session.cancelled}
                scoreTeam0={session.scoreTeam0}
                scoreTeam1={session.scoreTeam1}
                trainingType={session.trainingType}
                maxPresentPlayers={session.maxPresentPlayers}
              />
            ))}
            {selectedMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>

      {/* max-h + overflow-hidden on DialogContent itself keeps its box (and the close
          button pinned to its top-right corner) within the viewport no matter how tall
          the card gets — teams generated on a session, or a long composition on a match,
          used to push DialogContent past both edges of the screen with nothing capping
          its height, leaving the close button off-screen and unreachable on mobile. Only
          the inner wrapper scrolls, so the close button never moves. */}
      <Dialog open={activeSessionId !== null} onOpenChange={(open) => !open && setActiveSessionId(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Entraînement</DialogTitle>
          </DialogHeader>
          <div className="max-h-[85vh] overflow-y-auto">
            {activeSession && (
              <SessionCard
                sessionId={activeSession.id}
                date={activeSession.date}
                startTime={activeSession.startTime}
                endTime={activeSession.endTime}
                location={activeSession.location}
                cancelled={activeSession.cancelled}
                scoreTeam0={activeSession.scoreTeam0}
                scoreTeam1={activeSession.scoreTeam1}
                trainingType={activeSession.trainingType}
                maxPresentPlayers={activeSession.maxPresentPlayers}
                inDialog
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeMatchId !== null} onOpenChange={(open) => !open && setActiveMatchId(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Match</DialogTitle>
          </DialogHeader>
          <div className="max-h-[85vh] overflow-y-auto">
            {activeMatch && <MatchCard match={activeMatch} inDialog />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
