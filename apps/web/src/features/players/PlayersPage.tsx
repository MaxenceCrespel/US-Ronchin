import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { approveUser, createInvitation } from '@/features/auth/api'
import { SUB_POSITION_LABELS } from '@/lib/labels'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import type { User, UserRole } from '@/lib/types'
import { adminUpdateUser, deleteUser, fetchPlayers } from './api'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { AccountLevelRing, useAllAccountLevels } from '@/components/AccountLevelRing'

function EditPlayerDialog({ player }: { player: User }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<UserRole>(player.role)
  const [isPlayingCoach, setIsPlayingCoach] = useState(player.isPlayingCoach)
  const [isLicensed, setIsLicensed] = useState(player.isLicensed)
  const [licenseNumber, setLicenseNumber] = useState(player.licenseNumber ?? '')

  useEffect(() => {
    if (!open) return
    setRole(player.role)
    setIsPlayingCoach(player.isPlayingCoach)
    setIsLicensed(player.isLicensed)
    setLicenseNumber(player.licenseNumber ?? '')
  }, [open, player])

  const mutation = useMutation({
    mutationFn: () =>
      adminUpdateUser(player.id, {
        role,
        isPlayingCoach: role === 'COACH' ? isPlayingCoach : undefined,
        isLicensed,
        licenseNumber: licenseNumber || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {player.firstName} {player.lastName}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PLAYER">Joueur</SelectItem>
                <SelectItem value="COACH">Coach</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'COACH' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="isPlayingCoach"
                checked={isPlayingCoach}
                onCheckedChange={(checked) => setIsPlayingCoach(checked === true)}
              />
              <Label htmlFor="isPlayingCoach">
                Coach-joueur (compté comme joueur partout : compo, stats, badges...)
              </Label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="isLicensed"
              checked={isLicensed}
              onCheckedChange={(checked) => setIsLicensed(checked === true)}
            />
            <Label htmlFor="isLicensed">Joueur licencié FFF</Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="licenseNumber">Numéro de licence</Label>
            <Input
              id="licenseNumber"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeletePlayerDialog({ player }: { player: User }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const fullName = `${player.firstName} ${player.lastName}`

  const mutation = useMutation({
    mutationFn: () => deleteUser(player.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      setOpen(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirmText('')
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive size-7">
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" />
            Supprimer {fullName} ?
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Action <strong>irréversible</strong> : présences, stats, buts, votes et badges de ce
            compte seront définitivement supprimés.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmDelete">
              Tape <strong>{fullName}</strong> pour confirmer
            </Label>
            <Input
              id="confirmDelete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">Échec de la suppression. Réessaie.</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={confirmText !== fullName || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InvitePlayerDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isLicensed, setIsLicensed] = useState(false)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

  const inviteMutation = useMutation({
    mutationFn: () => createInvitation({ email, firstName, lastName, isLicensed }),
    onSuccess: (result) => {
      setInvitationUrl(result.invitationUrl)
      queryClient.invalidateQueries({ queryKey: ['players'] })
      setEmail('')
      setFirstName('')
      setLastName('')
      setIsLicensed(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setInvitationUrl(null)
      }}
    >
      <DialogTrigger asChild>
        <Button data-tour="players-invite">Inviter un joueur</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un joueur</DialogTitle>
        </DialogHeader>
        {invitationUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Compte créé. Transmets ce lien au joueur pour qu'il active son compte :
            </p>
            <Input readOnly value={invitationUrl} onFocus={(e) => e.target.select()} />
            <Button onClick={() => setOpen(false)}>Fermer</Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              inviteMutation.mutate()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isLicensed"
                checked={isLicensed}
                onCheckedChange={(checked) => setIsLicensed(checked === true)}
              />
              <Label htmlFor="isLicensed">Joueur licencié FFF</Label>
            </div>
            {inviteMutation.isError && (
              <p className="text-destructive text-sm">
                Impossible de créer l'invitation (email déjà utilisé ?).
              </p>
            )}
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Création...' : "Générer l'invitation"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function PlayersPage() {
  const user = useAuthStore((s) => s.user)
  const isCoach = hasCoachAccess(user)
  const queryClient = useQueryClient()
  const playersQuery = useQuery({ queryKey: ['players'], queryFn: fetchPlayers })
  const levelsQuery = useAllAccountLevels()

  const approveMutation = useMutation({
    mutationFn: (userId: string) => approveUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Effectif</h1>
        {isCoach && <InvitePlayerDialog />}
      </div>

      <Card data-tour="players-roster">
        <CardHeader>
          <CardTitle>Joueurs de l'équipe</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>N°</TableHead>
                {isCoach && <TableHead>Compte</TableHead>}
                {isCoach && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {playersQuery.data?.map((player) => (
                <TableRow key={player.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <AccountLevelRing
                        userId={player.id}
                        tier={levelsQuery.data?.[player.id]?.tier}
                        ringWidth={2}
                      >
                        <PlayerAvatar
                          avatarUrl={player.avatarUrl}
                          firstName={player.firstName}
                          lastName={player.lastName}
                          size="sm"
                        />
                      </AccountLevelRing>
                      {player.firstName} {player.lastName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={player.role === 'COACH' ? 'default' : 'secondary'}>
                      {player.role === 'COACH'
                        ? player.isPlayingCoach
                          ? 'Coach-Joueur'
                          : 'Coach'
                        : 'Joueur'}
                    </Badge>
                  </TableCell>
                  <TableCell>{player.isLicensed ? 'Licencié' : 'Non licencié'}</TableCell>
                  <TableCell>
                    {player.positions && player.positions.length > 0
                      ? player.positions.map((p) => SUB_POSITION_LABELS[p]).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell>{player.jerseyNumber ?? '—'}</TableCell>
                  {isCoach && (
                    <TableCell>
                      {player.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">À valider</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(player.id)}
                          >
                            Approuver
                          </Button>
                        </div>
                      ) : player.accountActivated ? (
                        <Badge variant="success">Actif</Badge>
                      ) : (
                        <Badge variant="outline">En attente d'activation</Badge>
                      )}
                    </TableCell>
                  )}
                  {isCoach && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EditPlayerDialog player={player} />
                        {player.id !== user?.id && <DeletePlayerDialog player={player} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
