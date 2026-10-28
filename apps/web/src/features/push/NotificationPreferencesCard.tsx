import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { hasCoachAccess } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { fetchMutedCategories, saveMutedCategories, type NotificationCategory } from './api'

const CATEGORIES: { key: NotificationCategory; label: string; hint: string; coachOnly?: boolean }[] = [
  { key: 'ATTENDANCE_REMINDERS', label: 'Rappels de présence', hint: "Quand tu n'as pas encore répondu pour un entraînement ou un match" },
  { key: 'CONVOCATIONS', label: 'Convocations', hint: 'Dès que le coach publie ou modifie la liste' },
  { key: 'TRAINING_TEAMS', label: "Équipes d'entraînement", hint: 'Quand les équipes sont tirées' },
  { key: 'MATCH_RESULTS', label: 'Résultats et votes', hint: 'Match joué, homme du match et patron de la défense révélés' },
  { key: 'AWARDS', label: 'Trophées', hint: 'Joueur du mois et trophées de fin de saison' },
  { key: 'BADGES', label: 'Badges', hint: 'À chaque déblocage' },
  { key: 'BIRTHDAYS', label: 'Anniversaires', hint: "Ceux de l'équipe, le jour J" },
  { key: 'COACH', label: 'Gestion coach', hint: 'Nouveau joueur, résultat manquant, pointage, joueurs à noter', coachOnly: true },
]

const QUERY_KEY = ['push-preferences']

/** One switch per kind of push. Saved on the account, so it applies to every device the
 * player has notifications on — which is why it shows even before they're enabled here. */
export function NotificationPreferencesCard() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { data: muted, isError } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchMutedCategories })

  const mutation = useMutation({
    mutationFn: saveMutedCategories,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationCategory[]>(QUERY_KEY)
      queryClient.setQueryData(QUERY_KEY, next)
      return { previous }
    },
    onError: (_error, _next, context) => queryClient.setQueryData(QUERY_KEY, context?.previous),
    onSuccess: (saved) => queryClient.setQueryData(QUERY_KEY, saved),
  })

  if (isError || muted === undefined) return null
  const categories = CATEGORIES.filter((c) => !c.coachOnly || hasCoachAccess(user))

  const mutedNow = muted
  function toggle(key: NotificationCategory) {
    mutation.mutate(mutedNow.includes(key) ? mutedNow.filter((k) => k !== key) : [...mutedNow, key])
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Ce que tu reçois</CardTitle>
        <CardDescription>Valable sur tous tes appareils où les notifications sont activées.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {categories.map(({ key, label, hint }) => {
            const on = !muted.includes(key)
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-muted-foreground text-xs">{hint}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => toggle(key)}
                    className={cn(
                      'focus-visible:ring-ring flex h-8 w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      on ? 'bg-club-blue justify-end' : 'justify-start bg-[#c3ced8]',
                    )}
                  >
                    <span className="size-[26px] rounded-full bg-white shadow" />
                  </button>
                </label>
              </li>
            )
          })}
        </ul>
        {mutation.isError && (
          <p role="alert" className="text-destructive px-4 py-3 text-sm sm:px-6">
            Impossible d'enregistrer ce choix, réessaie.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
