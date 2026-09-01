import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SubPageHeader } from '@/components/SubPageHeader'
import { useAuthStore } from '@/lib/auth-store'
import { resizeImageFile } from '@/lib/image-resize'
import { updateProfile, uploadAvatar, deleteAvatar } from './api'
import type { PlayerSubPosition, PreferredFoot } from '@/lib/types'
import { FOOT_LABELS } from '@/lib/labels'
import { PositionPicker } from '@/components/PositionPicker'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { FootballSpinner } from '@/components/FootballSpinner'

export function EditProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [positions, setPositions] = useState<PlayerSubPosition[]>(user?.positions ?? [])
  const [jerseyNumber, setJerseyNumber] = useState(user?.jerseyNumber?.toString() ?? '')
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | ''>(
    user?.preferredFoot ?? '',
  )
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        positions,
        jerseyNumber: jerseyNumber ? Number(jerseyNumber) : undefined,
        preferredFoot: preferredFoot || undefined,
        birthDate: birthDate || undefined,
      }),
    onSuccess: (updated) => setUser(updated),
  })

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => uploadAvatar(await resizeImageFile(file)),
    onSuccess: (updated) => setUser(updated),
  })
  const removeAvatarMutation = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: (updated) => setUser(updated),
  })

  if (!user) return null

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Modifier mon profil" backTo="/profile" />

      <Card className="mx-auto w-full max-w-xl">
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="relative">
            <PlayerAvatar
              avatarUrl={user.avatarUrl}
              firstName={user.firstName}
              lastName={user.lastName}
              size="xl"
            />
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
            {avatarMutation.isError && (
              <span className="text-destructive text-xs">
                Échec de l'envoi — réessaie avec une autre photo.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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

            <PositionPicker value={positions} onChange={setPositions} />
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
    </div>
  )
}
