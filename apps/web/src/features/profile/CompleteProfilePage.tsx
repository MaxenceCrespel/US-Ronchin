import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { FOOT_LABELS } from '@/lib/labels'
import { PositionPicker } from '@/components/PositionPicker'
import type { PlayerSubPosition, PreferredFoot } from '@/lib/types'
import { updateProfile } from './api'

export function CompleteProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [positions, setPositions] = useState<PlayerSubPosition[]>([])
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | ''>('')
  const [birthDate, setBirthDate] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        positions,
        preferredFoot: preferredFoot || undefined,
        birthDate: birthDate || undefined,
      }),
    onSuccess: (updated) => {
      setUser(updated)
      navigate('/', { replace: true })
    },
  })

  if (!user) return null

  const canSubmit = positions.length > 0 && !!preferredFoot && !!birthDate

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Complète ton profil</CardTitle>
          <CardDescription>
            Bienvenue {user.firstName} ! Avant d'accéder à l'application, renseigne ces quelques
            informations — elles sont nécessaires pour l'effectif, les compositions et certains
            badges (comme celui du but d'anniversaire 🎂).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
          >
            <div className="sm:col-span-2">
              <PositionPicker value={positions} onChange={setPositions} />
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthDate">Date de naissance</Label>
              <Input
                id="birthDate"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Button type="submit" disabled={!canSubmit || mutation.isPending}>
                {mutation.isPending ? 'Enregistrement...' : 'Continuer'}
              </Button>
              {mutation.isError && (
                <span className="text-destructive text-sm">
                  Une erreur est survenue, vérifie les champs et réessaie.
                </span>
              )}
              <button
                type="button"
                onClick={logout}
                className="text-muted-foreground w-fit text-xs underline decoration-dotted"
              >
                Déconnexion
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
