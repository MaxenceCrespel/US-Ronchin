import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { updateProfile, uploadAvatar, deleteAvatar } from './api'
import { changePassword } from '@/features/auth/api'
import type { PlayerSubPosition, PreferredFoot } from '@/lib/types'
import { SUB_POSITION_LABELS, FOOT_LABELS } from '@/lib/labels'
import { fetchSettings, updateSettings } from '@/features/settings/api'
import { BadgesGrid } from '@/features/badges/BadgesGrid'
import { NotificationSettingsCard } from '@/features/push/NotificationSettingsCard'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import {
  AccountLevelDialog,
  AccountLevelRing,
  TIER_BADGE_CLASS,
  TIER_LABELS,
  useAccountLevel,
} from '@/components/AccountLevelRing'
import { FootballSpinner } from '@/components/FootballSpinner'

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
  })

  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Mot de passe</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (passwordsMatch) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Mot de passe actuel</Label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Nouveau mot de passe (8 caractères min.)</Label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmNewPassword">Confirmer le nouveau mot de passe</Label>
            <PasswordInput
              id="confirmNewPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-destructive text-sm">Les mots de passe ne correspondent pas.</p>
          )}
          {mutation.isError && (
            <p className="text-destructive text-sm">
              {isAxiosError(mutation.error) && mutation.error.response?.status === 401
                ? 'Mot de passe actuel incorrect.'
                : "Impossible de changer le mot de passe."}
            </p>
          )}
          <Button type="submit" className="w-fit" disabled={!passwordsMatch || mutation.isPending}>
            {mutation.isPending ? 'Enregistrement...' : 'Changer le mot de passe'}
          </Button>
          {mutation.isSuccess && (
            <span className="text-muted-foreground text-sm">Mot de passe mis à jour.</span>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function ClubSettingsCard() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const [fffTeamUrl, setFffTeamUrl] = useState('')

  useEffect(() => {
    if (settingsQuery.data) setFffTeamUrl(settingsQuery.data.fffTeamUrl ?? '')
  }, [settingsQuery.data])

  const mutation = useMutation({
    mutationFn: () => updateSettings(fffTeamUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Paramètres du club</CardTitle>
        <CardDescription>Visible uniquement par le coach</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fffTeamUrl">URL de l'équipe sur epreuves.fff.fr</Label>
            <Input
              id="fffTeamUrl"
              type="url"
              placeholder="https://epreuves.fff.fr/competition/club/.../equipe/..."
              value={fffTeamUrl}
              onChange={(e) => setFffTeamUrl(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Change chaque saison — utilisée pour synchroniser le calendrier officiel depuis la
              page Matchs.
            </p>
          </div>
          <Button type="submit" className="w-fit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
          {mutation.isSuccess && (
            <span className="text-muted-foreground text-sm">Paramètres mis à jour.</span>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [positions, setPositions] = useState<PlayerSubPosition[]>(user?.positions ?? [])
  const [jerseyNumber, setJerseyNumber] = useState(user?.jerseyNumber?.toString() ?? '')
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | ''>(
    user?.preferredFoot ?? '',
  )
  const [heightCm, setHeightCm] = useState(user?.heightCm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(user?.weightKg?.toString() ?? '')
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')

  const levelQuery = useAccountLevel(user?.id ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        positions,
        jerseyNumber: jerseyNumber ? Number(jerseyNumber) : undefined,
        preferredFoot: preferredFoot || undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        birthDate: birthDate || undefined,
        phone: phone || undefined,
      }),
    onSuccess: (updated) => setUser(updated),
  })

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (updated) => setUser(updated),
  })
  const removeAvatarMutation = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: (updated) => setUser(updated),
  })

  if (!user) return null

  return (
    <div className="flex flex-col gap-6">
    <Card className="mx-auto w-full max-w-xl" data-tour="profile-form">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="relative">
            {levelQuery.data ? (
              <AccountLevelDialog level={levelQuery.data}>
                <AccountLevelRing userId={user.id} ringWidth={4}>
                  <PlayerAvatar
                    avatarUrl={user.avatarUrl}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    size="xl"
                  />
                </AccountLevelRing>
              </AccountLevelDialog>
            ) : (
              <AccountLevelRing userId={user.id} ringWidth={4}>
                <PlayerAvatar
                  avatarUrl={user.avatarUrl}
                  firstName={user.firstName}
                  lastName={user.lastName}
                  size="xl"
                />
              </AccountLevelRing>
            )}
            {avatarMutation.isPending && (
              <div className="bg-background/60 absolute inset-0 flex items-center justify-center rounded-full">
                <FootballSpinner className="text-xs" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="w-fit">
              <span className="border-input hover:bg-accent inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium">
                <Camera className="size-4" />
                {user.avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) avatarMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </label>
            {user.avatarUrl && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive w-fit text-xs underline decoration-dotted"
                disabled={removeAvatarMutation.isPending}
                onClick={() => removeAvatarMutation.mutate()}
              >
                Supprimer la photo
              </button>
            )}
          </div>
        </div>
        <CardTitle className="flex items-center gap-2">
          {user.firstName} {user.lastName}
          {levelQuery.data && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                TIER_BADGE_CLASS[levelQuery.data.tier],
              )}
            >
              {TIER_LABELS[levelQuery.data.tier]}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {user.isLicensed ? 'Joueur licencié' : 'Joueur non licencié'} — {user.email}
        </CardDescription>
      </CardHeader>
    </Card>

    <BadgesGrid userId={user.id} />

    <form
      className="mx-auto flex w-full max-w-xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birthDate">Date de naissance</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="heightCm">Taille (cm)</Label>
            <Input
              id="heightCm"
              type="number"
              min={100}
              max={230}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weightKg">Poids (kg)</Label>
            <Input
              id="weightKg"
              type="number"
              min={30}
              max={200}
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profil sportif</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jerseyNumber">Numéro de maillot</Label>
              <Input
                id="jerseyNumber"
                type="number"
                min={0}
                max={99}
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Pied fort</Label>
              <Select
                value={preferredFoot}
                onValueChange={(v) => setPreferredFoot(v as PreferredFoot)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FOOT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Postes (plusieurs possibles)</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {Object.entries(SUB_POSITION_LABELS).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={`position-${value}`}
                    checked={positions.includes(value as PlayerSubPosition)}
                    onCheckedChange={(checked) =>
                      setPositions((prev) =>
                        checked
                          ? [...prev, value as PlayerSubPosition]
                          : prev.filter((p) => p !== value),
                      )
                    }
                  />
                  <Label htmlFor={`position-${value}`} className="text-sm font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement...' : 'Enregistrer mon profil'}
        </Button>
        {mutation.isSuccess && (
          <span className="text-muted-foreground ml-3 text-sm">Profil mis à jour.</span>
        )}
      </div>
    </form>

    <NotificationSettingsCard />
    <ChangePasswordCard />
    {hasCoachAccess(user) && <ClubSettingsCard />}
    </div>
  )
}
