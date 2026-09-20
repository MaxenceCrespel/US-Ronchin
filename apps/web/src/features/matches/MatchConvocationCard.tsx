import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardList, Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { Match, MatchAttendance, PlayerSubPosition } from '@/lib/types'
import { fetchMatchAttendance, fetchMatchLineup, saveMatchLineup, setMatchConvocation } from './api'
import { bandForY, PitchFormationEditor } from './PitchFormationEditor'
import { DEFAULT_FORMATION, FORMATIONS, positionCodes, slotCodes } from './formations'

type Band = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'
const BAND_LABELS: Record<Band, string> = {
  GOALKEEPER: 'Gardien',
  DEFENDER: 'Défenseurs',
  MIDFIELDER: 'Milieux',
  FORWARD: 'Attaquants',
}
const BANDS: Band[] = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD']
const MAX_STARTERS = 11

/** Broad band of a profile position — same categories as the pitch coloring. */
function bandForPosition(position: PlayerSubPosition | undefined): Band | null {
  if (!position) return null
  if (position === 'GOALKEEPER') return 'GOALKEEPER'
  if (position === 'CENTER_BACK' || position === 'RIGHT_BACK' || position === 'LEFT_BACK') {
    return 'DEFENDER'
  }
  if (position === 'RIGHT_WINGER' || position === 'LEFT_WINGER' || position === 'STRIKER') {
    return 'FORWARD'
  }
  return 'MIDFIELDER'
}

function BandTiles({ counts }: { counts: Record<Band, number> }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {BANDS.map((band) => (
        <div key={band} className="flex flex-col items-center gap-0.5 rounded-md border px-1 py-2">
          <span className={cn('text-base font-bold tabular-nums', counts[band] === 0 ? 'text-destructive' : 'text-club-blue')}>
            {counts[band]}
          </span>
          <span className="text-muted-foreground text-[9.5px] font-medium tracking-wide uppercase">
            {BAND_LABELS[band]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A finished step reads green — same treatment on the entry button and inside the dialogs. */
const DONE_CLASS =
  'border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60'

function fullName(a: MatchAttendance) {
  return `${a.user.firstName} ${a.user.lastName}`.trim()
}

/** Coach-only: call the players who'll be in the squad among those who said PRESENT, then
 * compose the starting XI from them. The XI is picked up again by the post-match composition. */
export function MatchConvocationCard({ match }: { match: Match }) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<'convocation' | 'lineup' | null>(null)

  const attendanceQuery = useQuery({
    queryKey: ['match-attendance', match.id],
    queryFn: () => fetchMatchAttendance(match.id),
  })
  const lineupQuery = useQuery({
    queryKey: ['match-lineup', match.id],
    queryFn: () => fetchMatchLineup(match.id),
  })

  const present = useMemo(
    () => (attendanceQuery.data ?? []).filter((a) => a.status === 'PRESENT'),
    [attendanceQuery.data],
  )
  const announced = match.convocationAnnouncedAt !== null
  const announcedIds = useMemo(
    () => new Set(present.filter((a) => a.called).map((a) => a.userId)),
    [present],
  )
  const lineupValidated = lineupQuery.data?.validatedAt != null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="text-club-blue size-4" />
          Convocation et composition
        </CardTitle>
        <CardDescription>
          Convoque parmi les {present.length} joueur{present.length > 1 ? 's' : ''} présent
          {present.length > 1 ? 's' : ''}, puis prépare ton onze de départ.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ConvocationEntry
          icon={<Megaphone className="size-4" />}
          title="Convocation"
          subtitle={announced ? `${announcedIds.size} convoqué${announcedIds.size > 1 ? 's' : ''}` : 'À faire'}
          done={announced}
          onClick={() => setDialog('convocation')}
        />
        <ConvocationEntry
          icon={<ClipboardList className="size-4" />}
          title="Composition de départ"
          subtitle={
            !announced
              ? "Annonce la convocation d'abord"
              : lineupValidated
                ? `Validée · ${lineupQuery.data?.formation}`
                : 'À faire'
          }
          done={lineupValidated}
          disabled={!announced}
          onClick={() => setDialog('lineup')}
        />
      </CardContent>

      <ConvocationDialog
        open={dialog === 'convocation'}
        onClose={() => setDialog(null)}
        match={match}
        present={present}
        announcedIds={announcedIds}
        announced={announced}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['match-attendance', match.id] })
          queryClient.invalidateQueries({ queryKey: ['match', match.id] })
          queryClient.invalidateQueries({ queryKey: ['match-lineup', match.id] })
        }}
      />
      <LineupDialog
        open={dialog === 'lineup'}
        onClose={() => setDialog(null)}
        match={match}
        called={present.filter((a) => a.called)}
        saved={lineupQuery.data ?? null}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['match-lineup', match.id] })}
      />
    </Card>
  )
}

function ConvocationEntry({
  icon,
  title,
  subtitle,
  done,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  done: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn('h-auto justify-start gap-3 px-3 py-2.5 text-left', done && DONE_CLASS)}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className={cn('text-xs font-normal', done ? 'opacity-80' : 'text-muted-foreground')}>
          {subtitle}
        </span>
      </span>
      {done && <Check className="size-4" />}
    </Button>
  )
}

function ConvocationDialog({
  open,
  onClose,
  match,
  present,
  announcedIds,
  announced,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  match: Match
  present: MatchAttendance[]
  announcedIds: Set<string>
  announced: boolean
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  // Start from what's already announced each time the dialog opens.
  useEffect(() => {
    if (open) setDraft(new Set(announcedIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const added = [...draft].filter((id) => !announcedIds.has(id))
  const removed = [...announcedIds].filter((id) => !draft.has(id))
  const changes = added.length + removed.length

  const mutation = useMutation({
    mutationFn: () => setMatchConvocation(match.id, [...draft]),
    onSuccess: () => {
      setConfirming(false)
      onSaved()
      onClose()
    },
  })

  const counts = useMemo(() => {
    const c: Record<Band, number> = { GOALKEEPER: 0, DEFENDER: 0, MIDFIELDER: 0, FORWARD: 0 }
    for (const a of present) {
      const band = bandForPosition(a.user.positions?.[0])
      if (draft.has(a.userId) && band) c[band]++
    }
    return c
  }, [present, draft])

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convocation</DialogTitle>
            <DialogDescription>
              vs {match.opponent} ·{' '}
              {announced
                ? 'un joueur indisponible ? Décoche-le, puis mets à jour.'
                : 'coche les joueurs que tu convoques, sans nombre imposé.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-col gap-2.5">
            <div className="bg-accent flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
              <span className="text-club-blue text-xl font-bold tabular-nums">
                {draft.size}/{present.length}
              </span>
              <span className="text-muted-foreground text-xs">
                joueurs convoqués parmi les <strong className="text-foreground">{present.length} présents</strong>.
              </span>
            </div>
            <BandTiles counts={counts} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            {present.length === 0 && (
              <p className="text-muted-foreground p-4 text-center text-sm">
                Personne ne s'est encore déclaré présent.
              </p>
            )}
            {present.map((a) => {
              const positions = positionCodes(a.user.positions)
              return (
                <button
                  key={a.userId}
                  type="button"
                  onClick={() => toggle(a.userId)}
                  className={cn(
                    'hover:bg-accent flex w-full items-center gap-2.5 border-b px-3 py-2 text-left last:border-b-0',
                    draft.has(a.userId) && 'bg-club-blue/5',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName(a)}</span>
                  {positions.slice(0, 3).map((code) => (
                    <Badge key={code} variant="outline">
                      {code}
                    </Badge>
                  ))}
                  <Checkbox checked={draft.has(a.userId)} tabIndex={-1} className="pointer-events-none" />
                </button>
              )
            })}
          </div>
          {mutation.isError && <p className="text-destructive text-xs">Échec — réessaie.</p>}
          {announced && changes === 0 ? (
            <Button disabled className={cn('w-full', DONE_CLASS, 'disabled:opacity-100')}>
              <Check className="size-4" /> Convocation annoncée
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={draft.size === 0}
              onClick={() => setConfirming(true)}
            >
              {announced ? `Mettre à jour la convocation (${changes})` : 'Annoncer la convocation'}
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={announced ? 'Mettre à jour la convocation ?' : 'Annoncer la convocation ?'}
        description={
          announced
            ? `Seuls les joueurs dont le statut change sont prévenus : ${added.length} nouvellement convoqué${added.length > 1 ? 's' : ''}, ${removed.length} retiré${removed.length > 1 ? 's' : ''}.`
            : `${draft.size} convoqué${draft.size > 1 ? 's' : ''}, ${present.length - draft.size} non retenu${present.length - draft.size > 1 ? 's' : ''}. Chacun reçoit une notification avec son statut.`
        }
        confirmLabel={announced ? 'Mettre à jour' : 'Annoncer'}
        isPending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  )
}

function LineupDialog({
  open,
  onClose,
  match,
  called,
  saved,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  match: Match
  called: MatchAttendance[]
  saved: { formation: string | null; slots: string[] | null; validatedAt: string | null } | null
  onSaved: () => void
}) {
  const [formation, setFormation] = useState(DEFAULT_FORMATION)
  const [slots, setSlots] = useState<string[]>([])
  const [validated, setValidated] = useState(false)
  const [pendingBench, setPendingBench] = useState<string | null>(null)

  const byId = useMemo(() => new Map(called.map((a) => [a.userId, a])), [called])
  const target = Math.min(MAX_STARTERS, called.length)

  // Each time the dialog opens: start from the saved XI, then top it up to a full team.
  useEffect(() => {
    if (!open) return
    const key = saved?.formation && FORMATIONS[saved.formation] ? saved.formation : DEFAULT_FORMATION
    const kept = (saved?.slots ?? []).filter((id) => byId.has(id))
    setFormation(key)
    setSlots(kept.length >= target ? kept : autoFill(key, kept, called))
    setValidated(saved?.validatedAt != null && kept.length >= target)
    setPendingBench(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const codes = slotCodes(formation, slots)
  const bench = called.filter((a) => !slots.includes(a.userId))
  const pending = pendingBench ? byId.get(pendingBench) : undefined
  const pendingCodes = positionCodes(pending?.user.positions)
  const fitIds = new Set(slots.filter((id) => pendingCodes.includes(codes[id])))
  const noFit = !!pending && fitIds.size === 0

  const rows = (FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION]).rows
  const players = slots.map((id, index) => {
    const a = byId.get(id)
    // Same fixed-slot layout as the post-match formation step.
    let cursor = 1
    let pos = { x: 50, y: 92 }
    if (index > 0) {
      for (const row of rows) {
        if (index - 1 < cursor - 1 + row.slots.length) {
          const j = index - 1 - (cursor - 1)
          pos = { x: (100 / (row.slots.length + 1)) * (j + 1), y: row.y }
          break
        }
        cursor += row.slots.length
      }
    }
    return {
      userId: id,
      firstName: a?.user.firstName ?? '',
      lastName: a?.user.lastName ?? '',
      shirtNumber: a?.user.jerseyNumber ?? null,
      label: pending ? codes[id] : undefined,
      x: pos.x,
      y: pos.y,
    }
  })

  const counts: Record<Band, number> = { GOALKEEPER: 0, DEFENDER: 0, MIDFIELDER: 0, FORWARD: 0 }
  for (const p of players) counts[bandForY(p.y)]++

  function swap(a: string, b: string) {
    setSlots((prev) => {
      const next = [...prev]
      const i = next.indexOf(a)
      const j = next.indexOf(b)
      if (i < 0 || j < 0) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setValidated(false)
  }

  function substitute(outId: string) {
    if (!pendingBench) return
    setSlots((prev) => prev.map((id) => (id === outId ? pendingBench : id)))
    setPendingBench(null)
    setValidated(false)
  }

  const mutation = useMutation({
    mutationFn: () => saveMatchLineup(match.id, { formation, slots, validate: true }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Composition de départ</DialogTitle>
          <DialogDescription>vs {match.opponent}</DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Système de jeu</span>
            <Select
              value={formation}
              onValueChange={(v) => {
                setFormation(v)
                setValidated(false)
              }}
            >
              <SelectTrigger className="w-40">
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
          <BandTiles counts={counts} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <PitchFormationEditor
            players={players}
            onSwap={swap}
            pickMode={
              pending
                ? { onPick: substitute, fitIds: noFit ? new Set(slots) : fitIds }
                : undefined
            }
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Remplaçants ({bench.length})
            </p>
            <p className="text-muted-foreground text-xs">
              {pending ? (
                <>
                  <strong className="text-foreground">
                    {pending.user.firstName} joue {pendingCodes.join(' · ') || 'à un poste non renseigné'}.
                  </strong>{' '}
                  {noFit
                    ? 'Aucun de ses postes n’est dans ce système : tous les emplacements restent possibles.'
                    : `${fitIds.size} poste${fitIds.size > 1 ? 's' : ''} correspondant${fitIds.size > 1 ? 's' : ''} en surbrillance — touche le joueur à remplacer.`}
                </>
              ) : (
                'Glisse deux joueurs du terrain pour les échanger, ou touche un remplaçant puis le joueur qu’il remplace.'
              )}
            </p>
            <div className="rounded-lg border">
              {bench.length === 0 && (
                <p className="text-muted-foreground p-3 text-center text-xs">
                  Tous les convoqués sont titulaires.
                </p>
              )}
              {bench.map((a) => (
                <button
                  key={a.userId}
                  type="button"
                  onClick={() => setPendingBench((cur) => (cur === a.userId ? null : a.userId))}
                  className={cn(
                    'hover:bg-accent flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0',
                    pendingBench === a.userId && 'bg-club-blue/10 ring-club-blue ring-2 ring-inset',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName(a)}</span>
                  {positionCodes(a.user.positions).map((code) => (
                    <Badge key={code} variant="outline">
                      {code}
                    </Badge>
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>
        {mutation.isError && <p className="text-destructive text-xs">Échec — réessaie.</p>}
        {validated ? (
          <Button disabled className={cn('w-full', DONE_CLASS, 'disabled:opacity-100')}>
            <Check className="size-4" /> Composition validée
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={slots.length < target || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Enregistrement...' : 'Valider la composition'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Suggests a starting XI from the called players — each slot takes the player who lists
 * that exact position first, then someone from the same broad band, then anyone left. */
function autoFill(formation: string, kept: string[], called: MatchAttendance[]): string[] {
  const rows = (FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION]).rows
  const wanted = ['GB', ...rows.flatMap((r) => r.slots)]
  const bandOfCode = (code: string): Band =>
    code === 'GB' ? 'GOALKEEPER' : code.startsWith('D') ? 'DEFENDER' : code.startsWith('M') ? 'MIDFIELDER' : 'FORWARD'
  const target = Math.min(MAX_STARTERS, called.length)
  const used = new Set(kept)
  const result = [...kept]
  const pool = called.filter((a) => !used.has(a.userId))
  const take = (predicate: (a: MatchAttendance) => boolean) => {
    const found = pool.find((a) => !used.has(a.userId) && predicate(a))
    if (found) {
      used.add(found.userId)
      result.push(found.userId)
    }
    return !!found
  }
  for (let i = kept.length; i < wanted.length && result.length < target; i++) {
    const code = wanted[i]
    if (take((a) => positionCodes(a.user.positions).includes(code))) continue
    if (take((a) => bandForPosition(a.user.positions?.[0]) === bandOfCode(code))) continue
    take(() => true)
  }
  return result
}
