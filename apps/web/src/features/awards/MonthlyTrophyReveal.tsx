import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confetti } from '@/components/Confetti'
import { GALA_CONFETTI_COLORS, GoldText } from './AwardsCeremony'

// Same reason as every other trophy scene import — three.js is heavy, kept out of the main
// bundle until a device actually has a trophy to reveal.
const CategoryTrophyScene = lazy(() =>
  import('./Trophy3D').then((m) => ({ default: m.CategoryTrophyScene })),
)

export interface MonthlyTrophyWin {
  id: string
  categoryKey: string
  /** Eyebrow label above the trophy — the category name, e.g. "Joueur du mois". */
  label: string
  /** "SEPTEMBRE 2026" — engraved on the plaque, same as the trophy case's own month wins. */
  period: string
  /** "Félicitations Maxence !" if the viewer won, "Félicitations à Alexandre Comptdaer !"
   * (or "... et 2 autres !" past a couple of names) otherwise — built once by the watcher,
   * which is the one place that knows both the winner list and the viewer's own name. */
  headline: string
  /** "Joueur du mois — Septembre 2026" — the line under the headline. */
  subtitle: string
  /** Only true when the viewer wasn't among the winners — the "peut-être la prochaine fois"
   * line only makes sense addressed at someone who didn't win. */
  showBetterLuckNote: boolean
}

/** One monthly trophy's result, revealed full-screen to everyone (not just the winner) —
 * the successor to the old whole-roster MonthlyAwardCeremony (too heavy: a curtain and a
 * step-through show every few weeks) and to a winner-only version tried after that (too
 * quiet: nobody else ever found out who won). This lands in between: no curtain, just the
 * trophy settling into its spin (engraved with the month it was won) before the category
 * name and a one-line result rise in underneath it — congratulating the viewer directly if
 * they won, or naming the actual winner if they didn't. `queue` covers several monthly
 * categories closing together ("Joueur du mois" and "Assidu du mois" the same month) —
 * stepped through one at a time. */
export function MonthlyTrophyReveal({ queue, onDone }: { queue: MonthlyTrophyWin[]; onDone: () => void }) {
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
          <motion.p
            className="text-[11px] font-medium tracking-[0.28em] text-[#f4b400] uppercase"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            {trophy.label}
          </motion.p>

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
              <CategoryTrophyScene
                categoryKey={trophy.categoryKey}
                spinning={spinning}
                period={trophy.period}
                className="size-full"
              />
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
