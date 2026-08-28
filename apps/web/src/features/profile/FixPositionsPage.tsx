import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { PositionPicker } from '@/components/PositionPicker'
import type { PlayerSubPosition } from '@/lib/types'
import { updateProfile } from './api'

/** Retroactive correction gate (see RequireAuth.tsx / needsPositionsFix) for accounts that
 * had picked more than 3 positions before the cap existed — re-asks ONLY the positions,
 * starting from empty rather than pre-filled, since there's no reliable way to guess which
 * 3 of their existing picks were the real ones. */
export function FixPositionsPage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [positions, setPositions] = useState<PlayerSubPosition[]>([])

  const mutation = useMutation({
    mutationFn: () => updateProfile({ positions }),
    onSuccess: (updated) => {
      setUser(updated)
      navigate('/', { replace: true })
    },
  })

  if (!user) return null

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Repasse en revue tes postes</CardTitle>
          <CardDescription>
            Ton profil a plus de 3 postes enregistrés ({user.positions?.length ?? 0}). On a
            limité à 3 pour que la répartition des équipes d'entraînement reste fiable — avec
            trop de postes cochés par certains, l'appli ne pouvait plus savoir qui couvrait
            vraiment quoi. Choisis ton poste principal et, si besoin, jusqu'à deux autres par
            ordre de préférence.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PositionPicker value={positions} onChange={setPositions} />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              disabled={positions.length === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Enregistrement...' : 'Continuer'}
            </Button>
            {mutation.isError && (
              <span className="text-destructive text-sm">
                Une erreur est survenue, réessaie.
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
        </CardContent>
      </Card>
    </div>
  )
}
