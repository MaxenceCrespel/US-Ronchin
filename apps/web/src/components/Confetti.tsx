import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

const DEFAULT_COLORS = ['#0089cf', '#f4b400', '#ffffff', '#38a9e4', '#e8b923']

/** Confetti burst via canvas-confetti — real particle physics (gravity, drag, spread)
 * instead of a hand-rolled canvas loop, fired as a staggered cannon (a few bursts of
 * different spread/velocity/decay) for a fuller, less uniform effect than one flat batch.
 * `colors` defaults to the club palette (badge unlocks, tier-ups); pass a different one for
 * a differently-themed moment (e.g. gold/red for the awards ceremony) without touching
 * every other call site. */
export function Confetti({ active, colors = DEFAULT_COLORS }: { active: boolean; colors?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return

    // A <canvas> defaults to a 300×150 internal drawing buffer no matter what its CSS box
    // ends up being — `fixed inset-0` stretches that tiny buffer to fill the screen instead
    // of giving the library real screen-sized coordinates to simulate in. Every particle's
    // physics then plays out inside that 300×150 space and gets clipped the moment it drifts
    // past y=150, which — stretched over an 800px-tall phone — reads as "confetti stuck in
    // the top quarter". `resize: true` only re-syncs this on a window `resize` *event*, not
    // on creation, so the buffer has to be sized here explicitly before the first burst.
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    // No useWorker here — canvas-confetti's OffscreenCanvas/worker path was the prime
    // suspect behind a very strange, hard-to-pin-down compositing glitch elsewhere on the
    // page that only appeared after several bursts had accumulated; running on the main
    // thread is a little less efficient but was rock solid across the same test.
    const instance = confetti.create(canvas, { resize: true })
    // The library's own default `ticks` (200) fades a particle out well before gravity has
    // pulled it to the bottom of a tall phone screen, especially the low-velocity/high-decay
    // bursts below — it reads as confetti stopping mid-air. A moderate bump (plus a little
    // extra gravity) is enough to let every burst reach the bottom without the RAF loop
    // running so long that several overlapping bursts pile up.
    const defaults: confetti.Options = { colors, origin: { y: 0.5 }, gravity: 1.1, ticks: 300 }
    const fire = (particleRatio: number, opts: confetti.Options) =>
      instance({ ...defaults, ...opts, particleCount: Math.floor(200 * particleRatio) })

    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })

    return () => instance.reset()
  }, [active, colors])

  if (!active) return null

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[9999]" />
}
