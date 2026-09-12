import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { fetchSettings, updateSettings, runFffSync } from '@/features/settings/api'
import { syncStandings } from '@/features/standings/api'

export function ClubSettingsCard() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const [fffTeamUrl, setFffTeamUrl] = useState('')

  useEffect(() => {
    if (settingsQuery.data) setFffTeamUrl(settingsQuery.data.fffTeamUrl ?? '')
  }, [settingsQuery.data])

  // Saving a new/changed URL here used to leave the coach to separately remember to go hit
  // "Synchroniser" on the Matchs page and again on Stats > Bilan de saison — both scrapes are
  // triggered right away instead, same as the weekly scheduler does (see
  // fff-weekly-sync.scheduler.ts), so the new URL takes effect immediately everywhere.
  const mutation = useMutation({
    mutationFn: async () => {
      await updateSettings(fffTeamUrl)
      await Promise.allSettled([runFffSync(), syncStandings()])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['fff-sync-logs'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['standings'] })
      queryClient.invalidateQueries({ queryKey: ['standings-logs'] })
    },
  })

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
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
              page Matchs. L'URL doit ressembler à{' '}
              <code className="text-[11px]">
                https://epreuves.fff.fr/competition/club/.../equipe/.../...
              </code>{' '}
              — colle le lien de n'importe quel onglet de l'équipe (calendrier, classement,
              statistiques...), seul le début compte.
            </p>
          </div>
          <Button type="submit" className="w-fit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Synchronisation...' : 'Enregistrer'}
          </Button>
          {mutation.isSuccess && (
            <span className="text-muted-foreground text-sm">
              Paramètres enregistrés — calendrier et classement synchronisés.
            </span>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
