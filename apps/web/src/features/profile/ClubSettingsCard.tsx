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
  const [fffChampionshipUrl, setFffChampionshipUrl] = useState('')
  const [fffCupUrl, setFffCupUrl] = useState('')

  useEffect(() => {
    if (!settingsQuery.data) return
    setFffTeamUrl(settingsQuery.data.fffTeamUrl ?? '')
    setFffChampionshipUrl(settingsQuery.data.fffChampionshipUrl ?? '')
    setFffCupUrl(settingsQuery.data.fffCupUrl ?? '')
  }, [settingsQuery.data])

  // Just the URLs, saved plain — epreuves.fff.fr and the district sites both block the
  // production server's own IP (a WAF treats VPS/datacenter IPs, GitHub Actions' runners
  // included, as bots), so this server can never scrape them itself. These values are only
  // ever read by the local sync script (apps/api/src/local-fff-sync.ts, run from a real
  // computer's connection, which isn't blocked) — no point auto-triggering a scrape here that
  // would just fail every time.
  const mutation = useMutation({
    mutationFn: () => updateSettings({ fffTeamUrl, fffChampionshipUrl, fffCupUrl }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardDescription>Visible uniquement par le coach</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
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
              <code className="text-xs">
                https://epreuves.fff.fr/competition/club/500112-ronchin-us-3/equipe/2026_248_SEM_12/resultat-calendrier
              </code>
            </p>
            <p className="text-muted-foreground text-xs">Utilisée pour notre propre calendrier et nos résultats.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fffChampionshipUrl">URL du championnat sur le site du district</Label>
            <Input
              id="fffChampionshipUrl"
              type="url"
              placeholder="https://flandres.fff.fr/competitions?id=...&type=ch"
              value={fffChampionshipUrl}
              onChange={(e) => setFffChampionshipUrl(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              La page "Résultats" ou "Calendrier" de notre poule sur le site du district (ex: flandres.fff.fr) —
              utilisée pour afficher les matchs de toutes les équipes, journée par journée.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fffCupUrl">URL de la coupe sur le site du district</Label>
            <Input
              id="fffCupUrl"
              type="url"
              placeholder="https://flandres.fff.fr/competitions?id=...&type=cp"
              value={fffCupUrl}
              onChange={(e) => setFffCupUrl(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Même principe pour notre coupe — le parcours se complète tour par tour au fil des matchs tirés au sort.
            </p>
          </div>

          <p className="text-muted-foreground text-xs">
            Utilisées par le script de synchro à lancer depuis un ordinateur (voir
            apps/api/src/local-fff-sync.ts) — le serveur ne peut pas forcément scraper ces sites lui-même.
          </p>

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
