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
import { POSITION_LABELS, FOOT_LABELS } from '@/lib/labels'
import type { PlayerPosition, PreferredFoot } from '@/lib/types'
import { updateProfile } from './api'

export function CompleteProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [position, setPosition] = useState<PlayerPosition | ''>('')
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | ''>('')
  const [birthDate, setBirthDate] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [phone, setPhone] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        position: position || undefined,
        preferredFoot: preferredFoot || undefined,
        birthDate: birthDate || undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        phone: phone || undefined,
      }),
    onSuccess: (updated) => {
      setUser(updated)
      navigate('/', { replace: true })
    },
  })

  if (!user) return null

  const canSubmit =
    !!position && !!preferredFoot && !!birthDate && !!heightCm && !!weightKg && !!phone

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
            <div className="flex flex-col gap-1.5">
              <Label>Poste</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as PlayerPosition)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner un poste" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POSITION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="06 12 34 56 78"
                required
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
                required
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
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
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
