import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import type { GoalType, MatchEventType, MatchHomeAway, ParsedMatchSheet } from '@/lib/types'
import { isRosterPlayer } from '@/lib/roster'
import { fetchPlayers } from '@/features/players/api'
import {
  addEvent,
  createMatch,
  deleteEvent,
  fetchEvents,
  fetchMatches,
  setComposition,
  updateMatch,
} from '@/features/matches/api'
import { parseMatchPdf } from './api'

const EVENT_LABELS: Record<MatchEventType, string> = {
  GOAL: 'But',
  YELLOW_CARD: 'Carton jaune',
  RED_CARD: 'Carton rouge',
}

interface CompositionRow {
  pdfName: string
  jerseyNumber: number | null
  isStarter: boolean
  selectedUserId: string
}

interface GoalRow {
  minute: number | null
  playerPdfName: string
  selectedScorerId: string
  assistPdfName: string | null
  selectedAssistId: string
  goalType: GoalType | null
}

interface CardRow {
  minute: number | null
  playerPdfName: string
  selectedUserId: string
  type: MatchEventType
}

const NONE = '__none__'

export function ImportMatchPdfPage() {
  const navigate = useNavigate()
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })

  const [preview, setPreview] = useState<ParsedMatchSheet | null>(null)

  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [competition, setCompetition] = useState('')
  const [homeAway, setHomeAway] = useState<MatchHomeAway>('HOME')
  const [scoreHome, setScoreHome] = useState('')
  const [scoreAway, setScoreAway] = useState('')
  const [fffMatchId, setFffMatchId] = useState<string | null>(null)

  const [compositionRows, setCompositionRows] = useState<CompositionRow[]>([])
  const [goalRows, setGoalRows] = useState<GoalRow[]>([])
  const [cardRows, setCardRows] = useState<CardRow[]>([])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => parseMatchPdf(file),
    onSuccess: (sheet) => {
      setPreview(sheet)
      setOpponent(sheet.matchInfo.opponent ?? '')
      setDate(sheet.matchInfo.date ?? '')
      setVenue(sheet.matchInfo.venue ?? '')
      setCompetition(sheet.matchInfo.competition ?? '')
      setHomeAway(sheet.matchInfo.homeAway)
      setScoreHome(sheet.matchInfo.scoreHome?.toString() ?? '')
      setScoreAway(sheet.matchInfo.scoreAway?.toString() ?? '')
      setFffMatchId(sheet.matchInfo.fffMatchId)

      setCompositionRows(
        sheet.composition.map((c) => ({
          pdfName: c.pdfName,
          jerseyNumber: c.jerseyNumber,
          isStarter: c.isStarter,
          selectedUserId: c.matchedUserId ?? NONE,
        })),
      )
      setGoalRows(
        sheet.goals.map((g) => ({
          minute: g.minute,
          playerPdfName: g.playerPdfName,
          selectedScorerId: g.matchedUserId ?? NONE,
          assistPdfName: g.assistPdfName,
          selectedAssistId: g.assistMatchedUserId ?? NONE,
          goalType: g.goalType,
        })),
      )
      setCardRows(
        sheet.cards.map((c) => ({
          minute: c.minute,
          playerPdfName: c.playerPdfName,
          selectedUserId: c.matchedUserId ?? NONE,
          type: c.type,
        })),
      )
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // The FFF calendar sync may already have created this match (same fffMatchId) —
      // update it in place instead of creating a duplicate.
      const existing = fffMatchId
        ? (await fetchMatches()).find((m) => m.fffMatchId === fffMatchId)
        : undefined

      const match = existing
        ? await updateMatch(existing.id, {
            date,
            opponent,
            homeAway,
            venue: venue || undefined,
            competition: competition || undefined,
          })
        : await createMatch({
            date,
            opponent,
            homeAway,
            venue: venue || undefined,
            competition: competition || undefined,
            source: 'OFFICIAL_FFF',
            fffMatchId: fffMatchId ?? undefined,
          })

      if (existing) {
        // Re-importing a corrected sheet for the same match: clear previously logged
        // events so they don't get duplicated alongside the freshly parsed ones.
        const previousEvents = await fetchEvents(match.id)
        for (const event of previousEvents) {
          await deleteEvent(match.id, event.id)
        }
      }

      const entries = compositionRows
        .filter((r) => r.selectedUserId !== NONE)
        .map((r) => ({ userId: r.selectedUserId, isStarter: r.isStarter }))
      if (entries.length > 0) {
        await setComposition(match.id, entries)
      }

      for (const goal of goalRows) {
        if (goal.selectedScorerId === NONE) continue
        await addEvent(match.id, {
          type: 'GOAL',
          userId: goal.selectedScorerId,
          assistUserId: goal.selectedAssistId !== NONE ? goal.selectedAssistId : undefined,
          minute: goal.minute ?? undefined,
          goalType: goal.goalType ?? undefined,
        })
      }

      for (const card of cardRows) {
        if (card.selectedUserId === NONE) continue
        await addEvent(match.id, {
          type: card.type,
          userId: card.selectedUserId,
          minute: card.minute ?? undefined,
        })
      }

      if (scoreHome || scoreAway) {
        await updateMatch(match.id, {
          scoreHome: scoreHome ? Number(scoreHome) : undefined,
          scoreAway: scoreAway ? Number(scoreAway) : undefined,
          status: 'PLAYED',
        })
      }

      return match
    },
    onSuccess: (match) => navigate(`/matches/${match.id}`),
  })

  const players = playersQuery.data ?? []
  // Only players assigned in the composition can score/be carded — falls back to the
  // full roster if the composition rows haven't been matched to any accounts yet.
  const compositionSelectedIds = new Set(
    compositionRows.map((r) => r.selectedUserId).filter((id) => id !== NONE),
  )
  const eventPlayerPool =
    compositionSelectedIds.size > 0
      ? players.filter((p) => compositionSelectedIds.has(p.id))
      : players.filter((p) => isRosterPlayer(p))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Importer une feuille de match FFF</h1>

      {!preview && (
        <Card>
          <CardHeader>
            <CardTitle>Fichier PDF</CardTitle>
            <CardDescription>
              Télécharge la feuille de match depuis footclub.fff.fr puis importe-la ici.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadMutation.mutate(file)
              }}
            />
            {uploadMutation.isPending && (
              <p className="text-muted-foreground text-sm">Analyse du PDF en cours...</p>
            )}
            {uploadMutation.isError && (
              <p className="text-destructive text-sm">
                Impossible d'analyser ce PDF. Vérifie qu'il s'agit bien d'une feuille de match
                FFF.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Informations du match</CardTitle>
              <CardDescription>Vérifie et corrige si besoin avant de confirmer.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opponent">Adversaire</Label>
                <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Domicile / Extérieur</Label>
                <Select value={homeAway} onValueChange={(v) => setHomeAway(v as MatchHomeAway)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOME">Domicile</SelectItem>
                    <SelectItem value="AWAY">Extérieur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venue">Terrain</Label>
                <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="competition">Compétition</Label>
                <Input
                  id="competition"
                  value={competition}
                  onChange={(e) => setCompetition(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scoreHome">Score domicile</Label>
                  <Input
                    id="scoreHome"
                    type="number"
                    className="w-20"
                    value={scoreHome}
                    onChange={(e) => setScoreHome(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="scoreAway">Score extérieur</Label>
                  <Input
                    id="scoreAway"
                    type="number"
                    className="w-20"
                    value={scoreAway}
                    onChange={(e) => setScoreAway(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Composition détectée</CardTitle>
              <CardDescription>
                Associe chaque ligne à un compte existant, ou laisse « Ignorer » si le joueur
                n'a pas encore de compte (ajoutable ensuite depuis la fiche du match).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Nom (PDF)</TableHead>
                    <TableHead>Titulaire</TableHead>
                    <TableHead>Compte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compositionRows.map((row, index) => (
                    <TableRow key={`${row.pdfName}-${index}`}>
                      <TableCell>{row.jerseyNumber ?? '—'}</TableCell>
                      <TableCell>{row.pdfName}</TableCell>
                      <TableCell>{row.isStarter ? 'Oui' : 'Remplaçant'}</TableCell>
                      <TableCell>
                        <Select
                          value={row.selectedUserId}
                          onValueChange={(v) =>
                            setCompositionRows((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, selectedUserId: v } : r)),
                            )
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ignorer</SelectItem>
                            {players
                              .filter((p) => isRosterPlayer(p))
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.firstName} {p.lastName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {goalRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Buts détectés</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {goalRows.map((goal, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{goal.minute != null ? `${goal.minute}'` : '?'}</Badge>
                    <span className="text-muted-foreground">{goal.playerPdfName} →</span>
                    <Select
                      value={goal.selectedScorerId}
                      onValueChange={(v) =>
                        setGoalRows((prev) =>
                          prev.map((g, i) => (i === index ? { ...g, selectedScorerId: v } : g)),
                        )
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Ignorer</SelectItem>
                        {eventPlayerPool.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {cardRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cartons détectés</CardTitle>
                <CardDescription>
                  La couleur est déduite du motif — vérifie les cartons marqués « à vérifier ».
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {cardRows.map((card, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{card.minute != null ? `${card.minute}'` : '?'}</Badge>
                    <span className="text-muted-foreground">{card.playerPdfName} →</span>
                    <Select
                      value={card.selectedUserId}
                      onValueChange={(v) =>
                        setCardRows((prev) =>
                          prev.map((c, i) => (i === index ? { ...c, selectedUserId: v } : c)),
                        )
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Ignorer</SelectItem>
                        {eventPlayerPool.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={card.type}
                      onValueChange={(v) =>
                        setCardRows((prev) =>
                          prev.map((c, i) =>
                            i === index ? { ...c, type: v as MatchEventType } : c,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YELLOW_CARD">{EVENT_LABELS.YELLOW_CARD}</SelectItem>
                        <SelectItem value="RED_CARD">{EVENT_LABELS.RED_CARD}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              <Upload className="size-4" />
              {confirmMutation.isPending ? 'Import en cours...' : "Confirmer l'import"}
            </Button>
            {confirmMutation.isError && (
              <p className="text-destructive text-sm">Échec de l'import, réessaie.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
