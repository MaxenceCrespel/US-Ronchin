import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confetti } from '@/components/Confetti'
import { GALA_CONFETTI_COLORS, GoldText } from '@/features/awards/AwardsCeremony'

// Same reason as every other trophy scene import — three.js is heavy, kept out of the main
// bundle until a device actually has a trophy to reveal.
const CategoryTrophyScene = lazy(() =>
  import('@/features/awards/Trophy3D').then((m) => ({ default: m.CategoryTrophyScene })),
)

export interface MatchTrophyRevealItem {
  id: string
  kind: 'motm' | 'defense_boss'
  /** "Félicitations Maxence !" or "Félicitations à Adrien Rieb !" — built by the watcher,
   * the one place that knows both the winner(s) and the viewer's own name. */
  headline: string
  /** "Homme du match — US Ronchin 7 - 2 Voltaire · 23 août 2026". */
  subtitle: string
  /** Only true when the viewer wasn't among the winners. */
  showBetterLuckNote: boolean
}

/** One match trophy's result, revealed full-screen to every player who took part in that
 * match (not just the winner — see MonthlyTrophyReveal's sibling doc comment for the same
 * reasoning applied here) — a warm gold stage glow, the trophy settling into its spin, then
 * a one-line result congratulating the viewer directly if they won, or naming the actual
 * winner if they didn't, with a confetti burst timed to the reveal. `queue` covers winning
 * (or losing) both categories in the same match — stepped through one at a time via
 * "Suivant". Mounted by MatchTrophyUnlockWatcher, which decides *when* this should appear;
 * this component only knows how to show what it's handed. */
export function MatchTrophyReveal({ queue, onDone }: { queue: MatchTrophyRevealItem[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [confettiActive, setConfettiActive] = useState(false)
  const trophy = queue[index]
  const isLast = index + 1 >= queue.length

  useEffect(() => {
    setSpinning(false)
    setRevealed(false)
    setConfettiActive(false)
    const t1 = setTimeout(() => setSpinning(true), 300)
    const t2 = setTimeout(() => {
      setRevealed(true)
      setConfettiActive(true)
    }, 1100)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [index])

  function next() {
    if (isLast) {
      onDone()
      return
    }
    setIndex((i) => i + 1)
  }

  if (!trophy) return null

  return (
    <div className="fixed inset-0 z-[9998] overflow-hidden bg-black text-white">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 78% 55% at 50% 30%, #2a1c05 0%, #0d0904 55%, #000 100%)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: 'linear-gradient(to top, rgba(244,180,0,0.22), transparent)' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 240px 80px rgba(0,0,0,0.85)' }}
      />

      <Confetti active={confettiActive} colors={GALA_CONFETTI_COLORS} />

      <button
        type="button"
        onClick={onDone}
        aria-label="Fermer"
        className="absolute top-4 right-4 z-50 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white"
      >
        <X className="size-4" />
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          className="relative z-10 flex h-full flex-col items-center justify-center gap-5 px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            className="h-64 w-64"
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.85, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Trophy className="size-12 animate-pulse text-[#f4b400]/40" />
                </div>
              }
            >
              <CategoryTrophyScene categoryKey={trophy.kind} spinning={spinning} className="size-full" />
            </Suspense>
          </motion.div>

          <AnimatePresence>
            {revealed && (
              <motion.div
                className="flex flex-col items-center gap-1.5"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                <h2 className="text-3xl font-semibold tracking-tight">
                  <GoldText>{trophy.headline}</GoldText>
                </h2>
                <p className="text-sm text-white/60">{trophy.subtitle}</p>
                {trophy.showBetterLuckNote && (
                  <p className="text-sm text-white/40">Peut-être la prochaine fois pour toi.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {revealed && (
              <motion.div
                className="mt-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                <Button
                  size="lg"
                  className="bg-club-gold hover:bg-club-gold/90 text-black"
                  onClick={next}
                >
                  {isLast ? 'Fermer' : 'Suivant'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
