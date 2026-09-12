import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { fetchSettings, updateSettings } from '@/features/settings/api'

export function ClubSettingsCard() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const [fffTeamUrl, setFffTeamUrl] = useState('')

  useEffect(() => {
    if (settingsQuery.data) setFffTeamUrl(settingsQuery.data.fffTeamUrl ?? '')
  }, [settingsQuery.data])

  // Just the URL, saved plain — epreuves.fff.fr blocks the production server's own IP (a WAF
  // treats VPS/datacenter IPs, GitHub Actions' runners included, as bots), so this server can
  // never scrape it itself. This value is only ever read by the local sync script
  // (apps/api/src/local-fff-sync.ts, run from a real computer's connection, which isn't
  // blocked) — no point auto-triggering a scrape here that would just fail every time.
  const mutation = useMutation({
    mutationFn: () => updateSettings(fffTeamUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
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
              Exemple :{' '}
              <code className="text-[11px]">
                https://epreuves.fff.fr/competition/club/500112-ronchin-us-3/equipe/2026_248_SEM_12/resultat-calendrier
              </code>
            </p>
            <p className="text-muted-foreground text-xs">
              Utilisée par le script de synchro à lancer depuis un ordinateur (voir
              apps/api/src/local-fff-sync.ts) — le serveur ne peut plus scraper FFF lui-même.
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
