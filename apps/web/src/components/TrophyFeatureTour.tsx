import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confetti } from '@/components/Confetti'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { useCeremonyGateStore } from '@/lib/ceremony-gate'
import { hasSeenTrophyFeatureIntro, markTrophyFeatureIntroSeen } from '@/lib/trophy-feature-seen'
import { GALA_CONFETTI_COLORS, GoldText } from '@/features/awards/AwardsCeremony'

const PROFILE_PATH = '/profile'
const TROPHIES_PATH = '/profile/trophies'

/** The mini-tour's stops — anchored to `data-trophy-tour` attributes, a separate attribute
 * from the main onboarding tour's own `data-tour` so the two engines (this one, deliberately
 * much simpler — no demo-data injection, just "navigate there, scroll to it, ring it") never
 * collide on the same element. The first stop lives on /profile itself (where to even find
 * the vitrine) before the rest walk through what's inside it on /profile/trophies — `path`
 * is compared against the current route on every step change so the tour navigates there by
 * itself rather than assuming the viewer is already on the right page. */
const STEPS: { path: string; selector: string; title: string; description: string }[] = [
  {
    path: PROFILE_PATH,
    selector: '[data-trophy-tour="profile-nav"]',
    title: 'Dans ton profil',
    description: 'Retrouve tous tes trophées à tout moment depuis "Ma vitrine de trophées", dans ton profil.',
  },
  {
    path: TROPHIES_PATH,
    selector: '[data-trophy-tour="matches"]',
    title: 'Vitrine des matchs',
    description: '"Homme du match" et "Patron de la défense", révélés après chaque match.',
  },
  {
    path: TROPHIES_PATH,
    selector: '[data-trophy-tour="month"]',
    title: 'Vitrine du mois',
    description: '"Joueur du mois", "Assidu du mois" et "Vainqueur d\'entraînement", chaque mois.',
  },
  {
    path: TROPHIES_PATH,
    selector: '[data-trophy-tour="season"]',
    title: 'Vitrine de la saison',
    description: "Les récompenses votées par l'équipe en fin de saison.",
  },
]

/** Finds the current step's target, scrolls it into view and rings it in gold — retries for
 * a couple of seconds since the page this component just navigated to may still be loading
 * its data (the shelves only render once their queries resolve). */
function useStepHighlight(selector: string | null) {
  useEffect(() => {
    if (!selector) return
    let cancelled = false
    let target: HTMLElement | null = null
    let attempts = 0

    const tryHighlight = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(selector)
      if (el) {
        target = el
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.transition = 'outline-color 0.2s ease'
        el.style.outline = '3px solid #f4b400'
        el.style.outlineOffset = '4px'
        el.style.borderRadius = '1rem'
        return
      }
      attempts += 1
      if (attempts < 20) setTimeout(tryHighlight, 150)
    }
    tryHighlight()

    return () => {
      cancelled = true
      if (target) {
        target.style.outline = ''
        target.style.outlineOffset = ''
      }
    }
  }, [selector])
}

/** Announces the trophy vitrine feature to every existing player, once — a short celebratory
 * moment (spinning trophy icon, gold glow, confetti) followed by a light 3-stop walkthrough
 * of the trophy case's three shelves. Deliberately much simpler than OnboardingTour (no
 * demo-data injection, no per-page prerequisite chain): this covers one page with three
 * already-real shelves, so a plain "scroll to it, ring it, caption underneath" is enough.
 * Mounted once at the app root; waits for the main onboarding tour to finish first (a
 * brand-new player shouldn't get two different walkthroughs stacked on their first visit) and
 * for the current user to actually have completed it. */
export function TrophyFeatureTour() {
  const user = useAuthStore((s) => s.user)
  const onboardingActive = useOnboardingUiStore((s) => s.active)
  const navigate = useNavigate()
  const location = useLocation()
  const [phase, setPhase] = useState<'hidden' | 'intro' | 'touring'>('hidden')
  const [stepIndex, setStepIndex] = useState(0)

  const eligible =
    !!user && user.hasSeenOnboarding && !onboardingActive && !hasSeenTrophyFeatureIntro(user.id)

  // Lowest priority of every full-screen overlay in the app (see ceremony-gate.ts) — a
  // genuine trophy reveal or the season ceremony always gets to happen first; this one-time
  // announcement just waits its turn instead of ever stacking on top of one.
  const gateActive = useCeremonyGateStore((s) => s.active)
  const claimGate = useCeremonyGateStore((s) => s.claim)
  const releaseGate = useCeremonyGateStore((s) => s.release)
  const [holdsGate, setHoldsGate] = useState(false)
  useEffect(() => {
    if (!eligible) return
    if (holdsGate) {
      if (gateActive !== 'tour') setHoldsGate(false)
      return
    }
    if (gateActive !== null) return
    if (claimGate('tour')) setHoldsGate(true)
  }, [eligible, gateActive, holdsGate, claimGate])
  useEffect(() => {
    if (!eligible && holdsGate) {
      releaseGate('tour')
      setHoldsGate(false)
    }
  }, [eligible, holdsGate, releaseGate])
  useEffect(() => {
    return () => releaseGate('tour')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!eligible || !holdsGate || phase !== 'hidden') return
    setPhase('intro')
  }, [eligible, holdsGate, phase])

  useStepHighlight(phase === 'touring' ? STEPS[stepIndex].selector : null)

  function goToStep(index: number) {
    setStepIndex(index)
    if (location.pathname !== STEPS[index].path) navigate(STEPS[index].path)
  }

  function startTour() {
    setPhase('touring')
    goToStep(0)
  }

  function finish() {
    markTrophyFeatureIntroSeen(user!.id)
    setPhase('hidden')
    releaseGate('tour')
    setHoldsGate(false)
  }

  function next() {
    if (stepIndex + 1 >= STEPS.length) {
      finish()
      return
    }
    goToStep(stepIndex + 1)
  }

  // Re-checked at render time, not just when entering — a higher-priority reveal (a genuine
  // trophy, or the season ceremony) can preempt the gate *after* this already transitioned
  // past 'hidden' (see the claim effect above); without this check the tour would keep
  // rendering underneath/alongside whatever just preempted it instead of yielding the
  // screen back immediately.
  if (phase === 'hidden' || !holdsGate) return null

  return (
    <AnimatePresence>
      {phase === 'intro' && (
        <motion.div
          className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-5 overflow-hidden bg-black px-6 text-center text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 78% 55% at 50% 30%, #2a1c05 0%, #0d0904 55%, #000 100%)' }}
          />
          <Confetti active colors={GALA_CONFETTI_COLORS} />
          <button
            type="button"
            onClick={finish}
            aria-label="Fermer"
            className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white"
          >
            <X className="size-4" />
          </button>
          <motion.span
            className="border-club-gold/50 bg-club-gold/10 relative z-10 flex size-16 items-center justify-center rounded-full border"
            initial={{ scale: 0.6, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            <Trophy className="text-club-gold size-7" />
          </motion.span>
          <div className="relative z-10">
            <p className="text-[11px] font-medium tracking-[0.28em] text-[#f4b400] uppercase">Nouveauté</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              <GoldText>La vitrine de trophées</GoldText>
            </h2>
            <p className="mt-3 max-w-xs text-white/70">
              Chaque trophée gagné — en match, dans le mois, ou en fin de saison — a maintenant sa place, en 3D,
              dans ta vitrine perso.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <Button size="lg" onClick={startTour} className="bg-club-gold hover:bg-club-gold/90 text-black">
              Découvrir
            </Button>
            <Button size="lg" variant="ghost" onClick={finish} className="text-white/70 hover:bg-white/10 hover:text-white">
              Plus tard
            </Button>
          </div>
        </motion.div>
      )}

      {phase === 'touring' && (
        <motion.div
          key={stepIndex}
          className="fixed inset-x-0 bottom-0 z-[9998] flex justify-center px-4 pb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="border-club-gold/40 bg-club-blue-dark w-full max-w-sm rounded-2xl border p-4 text-white shadow-2xl">
            <div className="mb-2 flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-club-gold' : 'bg-white/15'}`}
                />
              ))}
            </div>
            <p className="text-xs font-medium text-white/40">
              {stepIndex + 1} / {STEPS.length}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold">{STEPS[stepIndex].title}</h3>
            <p className="mt-1 text-sm text-white/70">{STEPS[stepIndex].description}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={finish}
                className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
              >
                Passer
              </button>
              <Button size="sm" onClick={next} className="bg-club-gold hover:bg-club-gold/90 text-black">
                {stepIndex + 1 >= STEPS.length ? 'Terminer' : 'Suivant'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
