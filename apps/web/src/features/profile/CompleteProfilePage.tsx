import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { SUB_POSITION_LABELS, FOOT_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { PlayerSubPosition, PreferredFoot } from '@/lib/types'
import { updateProfile } from './api'

// Matches the backend's @ArrayMaxSize(3) on UpdateProfileDto.positions — see ProfilePage.tsx.
const MAX_POSITIONS = 3

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
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>
                Postes ({positions.length}/{MAX_POSITIONS})
              </Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {Object.entries(SUB_POSITION_LABELS).map(([value, label]) => {
                  const checked = positions.includes(value as PlayerSubPosition)
                  const disabled = !checked && positions.length >= MAX_POSITIONS
                  return (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`position-${value}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(next) =>
                          setPositions((prev) =>
                            next
                              ? [...prev, value as PlayerSubPosition]
                              : prev.filter((p) => p !== value),
                          )
                        }
                      />
                      <Label
                        htmlFor={`position-${value}`}
                        className={cn('text-sm font-normal', disabled && 'text-muted-foreground')}
                      >
                        {label}
                      </Label>
                    </div>
                  )
                })}
              </div>
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
