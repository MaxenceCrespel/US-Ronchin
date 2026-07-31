import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { updateProfile } from '@/features/profile/api'
import { buildTourDemoData } from '@/lib/tour-demo-data'

interface TourStep {
  path: string
  target: string
  title: string
  description: string
  coachOnly?: boolean
  /** data-tour selector to click once if `target` isn't found after a few tries — e.g.
   * selecting a calendar day so its session card (and attendance buttons) actually renders. */
  prerequisite?: string
}

const STEPS: TourStep[] = [
  {
    path: '/',
    target: 'home-page',
    title: 'Ton accueil',
    description: 'Le prochain rendez-vous de l’équipe s’affiche ici dès que tu te connectes.',
  },
  {
    path: '/trainings',
    target: 'trainings-calendar',
    title: 'Entraînements — le calendrier',
    description:
      'Navigue de semaine en semaine et clique un jour pour ouvrir la séance correspondante.',
  },
  {
    path: '/trainings',
    target: 'attendance-toggle',
    title: 'Se déclarer présent',
    description:
      'Sur la séance du jour, touche Présent, Incertain ou Absent — c’est ce qui fait avancer ta série et débloque des badges.',
    prerequisite: 'training-day-with-session',
  },
  {
    path: '/trainings',
    target: 'trainings-manage',
    title: 'Créer des entraînements',
    description:
      'En tant que coach, définis les créneaux récurrents (ex : tous les mardis 19h) ou ponctuels de l’équipe.',
    coachOnly: true,
  },
  {
    path: '/matches',
    target: 'matches-month',
    title: 'Matchs — vue du mois',
    description:
      'Tous les matchs du mois, avec une couleur différente pour l’amical, la coupe et le championnat.',
  },
  {
    path: '/matches',
    target: 'matches-add',
    title: 'Ajouter un match amical',
    description: 'Crée rapidement un match hors championnat, sans passer par la FFF.',
    coachOnly: true,
  },
  {
    path: '/matches',
    target: 'matches-import',
    title: 'Import des feuilles FFF',
    description:
      'Importe directement la feuille de match officielle : composition, buts et cartons sont extraits automatiquement.',
    coachOnly: true,
  },
  {
    path: '/stats',
    target: 'stats-monthly-challenges',
    title: 'Défis du mois',
    description: 'Qui marque le plus, qui est le plus présent ce mois-ci — remis à zéro chaque mois.',
  },
  {
    path: '/stats',
    target: 'stats-roster-table',
    title: 'Récapitulatif de l’effectif',
    description:
      'Buts, passes, cartons, note moyenne et assiduité de chaque joueur, calculés à partir de tes matchs et entraînements.',
  },
  {
    path: '/players',
    target: 'players-roster',
    title: 'Effectif',
    description: 'Toute l’équipe, joueurs et coach, avec leur poste et leur statut de licence.',
  },
  {
    path: '/players',
    target: 'players-invite',
    title: 'Inviter un joueur',
    description: 'Génère un lien d’invitation pour qu’un nouveau joueur crée son compte.',
    coachOnly: true,
  },
  {
    path: '/profile',
    target: 'profile-form',
    title: 'Ton profil',
    description: 'Photo, poste, numéro de maillot, pied fort... renseigne-les pour un profil complet.',
  },
  {
    path: '/profile',
    target: 'profile-badges',
    title: 'Tes badges',
    description:
      'Ils se débloquent tout seuls selon ce que tu fais sur le terrain — certains sont bien cachés.',
  },
]

const STEP_DURATION_MS = 6_500
const FIND_RETRY_MS = 150
const FIND_MAX_TRIES = 25

export function OnboardingTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const manualOpen = useOnboardingUiStore((s) => s.manualOpen)
  const closeManual = useOnboardingUiStore((s) => s.close)
  const setTourActive = useOnboardingUiStore((s) => s.setActive)
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const returnPathRef = useRef<string | null>(null)
  const demoKeysRef = useRef<unknown[][] | null>(null)
  const originalQueryDefaultsRef = useRef<Record<string, unknown> | null>(null)

  const steps = STEPS.filter((s) => !s.coachOnly || user?.role === 'COACH')
  const open = manualOpen || (!!user && !user.hasSeenOnboarding)
  const step = steps[stepIndex]

  const dismissMutation = useMutation({
    mutationFn: () => updateProfile({ hasSeenOnboarding: true }),
    onSuccess: (updated) => setUser(updated),
  })

  useEffect(() => {
    setTourActive(open)
  }, [open, setTourActive])

  // Fill the query cache with demo data for the tour's duration — every real page reads
  // from it like it would real data. Freeze staleTime so nothing gets silently overwritten
  // by a background refetch of the user's (possibly empty) real data mid-tour.
  useEffect(() => {
    if (!open || !user || demoKeysRef.current) return
    originalQueryDefaultsRef.current = { ...queryClient.getDefaultOptions().queries }
    queryClient.setDefaultOptions({
      queries: { ...originalQueryDefaultsRef.current, staleTime: Infinity },
    })
    const entries = buildTourDemoData(user)
    for (const { key, data } of entries) queryClient.setQueryData(key, data)
    demoKeysRef.current = entries.map((e) => e.key)
  }, [open, user, queryClient])

  function close() {
    closeManual()
    setPlaying(true)
    setStepIndex(0)
    setRect(null)
    if (returnPathRef.current) {
      navigate(returnPathRef.current)
      returnPathRef.current = null
    }
    if (!user?.hasSeenOnboarding) dismissMutation.mutate()
    // Swap the demo data back out for the account's real data.
    if (demoKeysRef.current) {
      if (originalQueryDefaultsRef.current) {
        queryClient.setDefaultOptions({ queries: originalQueryDefaultsRef.current })
      }
      // Remove (not just invalidate) so no component can glimpse stale demo data
      // while its query briefly re-enables before the real refetch resolves.
      for (const key of demoKeysRef.current) queryClient.removeQueries({ queryKey: key })
      demoKeysRef.current = null
    }
  }

  // Navigate the real app to each step's page.
  useEffect(() => {
    if (!open || !step) return
    if (returnPathRef.current === null) returnPathRef.current = location.pathname
    if (location.pathname !== step.path) navigate(step.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex])

  // Locate the real DOM element to spotlight, retrying while the page finishes rendering.
  // If it never shows up (e.g. no session on the day currently selected), click the step's
  // prerequisite once — like picking a calendar day that actually has a session — then keep looking.
  useEffect(() => {
    if (!open || !step) return
    setRect(null)
    let tries = 0
    let cancelled = false
    let clickedPrerequisite = false

    function locate() {
      if (cancelled) return
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) {
        setRect(el.getBoundingClientRect())
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      if (!clickedPrerequisite && step.prerequisite && tries >= 3) {
        clickedPrerequisite = true
        const prereq = document.querySelector<HTMLElement>(`[data-tour="${step.prerequisite}"]`)
        prereq?.click()
      }
      if (tries < FIND_MAX_TRIES) {
        tries += 1
        setTimeout(locate, FIND_RETRY_MS)
      }
    }
    locate()

    const onReflow = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, stepIndex, step])

  useEffect(() => {
    if (!open || !playing || !steps.length) return
    const timer = setTimeout(() => {
      if (stepIndex === steps.length - 1) close()
      else setStepIndex((i) => i + 1)
    }, STEP_DURATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing, stepIndex, steps.length])

  if (!open || !user || !step) return null

  const isLast = stepIndex === steps.length - 1
  const pad = 8
  const spotlightStyle = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null

  // Position the tooltip near the spotlighted element, clamped inside the viewport.
  const tooltipWidth = 320
  const tooltipTop = rect
    ? rect.bottom + pad + 12 + 140 < window.innerHeight
      ? rect.bottom + pad + 12
      : Math.max(12, rect.top - pad - 12 - 140)
    : window.innerHeight / 2 - 70
  const tooltipLeft = rect
    ? Math.min(Math.max(12, rect.left), window.innerWidth - tooltipWidth - 12)
    : window.innerWidth / 2 - tooltipWidth / 2

  return (
    <div className="fixed inset-0 z-[9997]">
      {spotlightStyle && (
        <div
          className="pointer-events-none fixed rounded-xl border-2 border-white/80 transition-all duration-300"
          style={{ ...spotlightStyle, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6)' }}
        />
      )}
      {!spotlightStyle && (
        <div className="pointer-events-none fixed inset-0 bg-slate-900/60 transition-opacity" />
      )}

      <div
        className="pointer-events-auto fixed z-[9998] flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-2xl transition-all duration-300"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{step.title}</p>
          <button
            type="button"
            onClick={close}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Fermer le tutoriel"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-xs">{step.description}</p>

        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
              <div className={cn('h-full bg-club-blue transition-all', i <= stepIndex ? 'w-full' : 'w-0')} />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? 'Pause' : 'Reprendre'}
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Précédent
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast ? close() : setStepIndex((i) => i + 1))}>
              {isLast ? 'Terminer' : 'Suivant'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
