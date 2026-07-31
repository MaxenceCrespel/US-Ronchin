import { useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BadgeRarity, BadgeStatus } from '@/lib/types'
import { RARITY_LABELS, RARITY_RING } from '@/features/badges/BadgesGrid'

const PARTICLE_COLORS = ['#facc15', '#38bdf8', '#34d399', '#f472b6', '#f97316', '#a78bfa']

/** Everything about the reveal scales with rarity — a common badge is a quick pop, a
 * legendary one gets a longer charge, more particles, and a much brighter burst. */
const RARITY_GLOW: Record<BadgeRarity, string> = {
  COMMON: 'rgba(168,162,158,0.5)',
  RARE: 'rgba(14,165,233,0.55)',
  EPIC: 'rgba(168,85,247,0.6)',
  LEGENDARY: 'rgba(251,191,36,0.75)',
}

const RARITY_PACK_STYLE: Record<BadgeRarity, string> = {
  COMMON: 'border-stone-400/60 from-stone-500 via-stone-600 to-stone-400/60 shadow-[0_0_40px_rgba(168,162,158,0.35)]',
  RARE: 'border-sky-400/70 from-sky-600 via-sky-700 to-sky-400/50 shadow-[0_0_45px_rgba(14,165,233,0.4)]',
  EPIC: 'border-purple-400/70 from-purple-600 via-purple-700 to-purple-400/50 shadow-[0_0_50px_rgba(168,85,247,0.45)]',
  LEGENDARY:
    'border-amber-300/80 from-amber-500 via-yellow-500 to-amber-300/70 shadow-[0_0_65px_rgba(251,191,36,0.6)]',
}

const RARITY_PARTICLE_COUNT: Record<BadgeRarity, number> = {
  COMMON: 12,
  RARE: 18,
  EPIC: 26,
  LEGENDARY: 36,
}

const RARITY_CHARGE_MS: Record<BadgeRarity, number> = {
  COMMON: 380,
  RARE: 480,
  EPIC: 600,
  LEGENDARY: 820,
}

const RARITY_FLASH_SCALE: Record<BadgeRarity, number> = {
  COMMON: 2.4,
  RARE: 2.8,
  EPIC: 3.4,
  LEGENDARY: 4.2,
}

function BurstParticles({ triggerKey, count, spread }: { triggerKey: number; count: number; spread: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const particles = Array.from(container.children) as HTMLElement[]
    animate(particles, {
      translateX: () => (Math.random() - 0.5) * spread,
      translateY: () => (Math.random() - 0.5) * spread,
      rotate: () => (Math.random() - 0.5) * 360,
      scale: [{ to: 1 }, { to: 0 }],
      opacity: [{ to: 1 }, { to: 0 }],
      duration: 1000,
      delay: stagger(6),
      ease: 'outCubic',
    })
  }, [triggerKey, spread])

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute size-2 rounded-sm"
          style={{ backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length] }}
        />
      ))}
    </div>
  )
}

type Phase = 'closed' | 'charging' | 'opening' | 'revealed'

/** Full-screen "pack opening" reveal for newly-earned badges — tap the pack, watch it
 * charge up and burst into light rays + confetti, then the badge zooms in with a glow.
 * Rarer badges get a longer charge, a bigger flash, and more particles. */
export function BadgePackReveal({ queue, onDone }: { queue: BadgeStatus[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('closed')
  const [burstKey, setBurstKey] = useState(0)
  const packRef = useRef<HTMLButtonElement>(null)
  const shineRef = useRef<HTMLDivElement>(null)
  const raysRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const medalRef = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)

  const badge = queue[index]
  const rarity: BadgeRarity = badge?.rarity ?? 'COMMON'
  const glow = RARITY_GLOW[rarity]

  // idle pack: gentle breathing pulse + a diagonal shine sweeping across it on loop —
  // legendary packs breathe faster, they can barely contain themselves
  useEffect(() => {
    if (phase !== 'closed' || !packRef.current) return
    const pulse = animate(packRef.current, {
      scale: [{ to: 1.04 }, { to: 1 }],
      duration: rarity === 'LEGENDARY' ? 700 : 1100,
      loop: true,
      ease: 'inOutSine',
    })
    let shine: ReturnType<typeof animate> | null = null
    if (shineRef.current) {
      shine = animate(shineRef.current, {
        translateX: ['-140%', '260%'],
        duration: 1600,
        loop: true,
        loopDelay: rarity === 'LEGENDARY' ? 300 : 700,
        ease: 'inOutQuad',
      })
    }
    return () => {
      pulse.pause()
      shine?.pause()
    }
  }, [phase, index, rarity])

  // rays behind the badge keep slowly spinning once the pack has burst open
  useEffect(() => {
    if (phase === 'closed' || !raysRef.current) return
    const anim = animate(raysRef.current, {
      rotate: '1turn',
      duration: 9000,
      loop: true,
      ease: 'linear',
    })
    return () => {
      anim.pause()
    }
  }, [phase, index])

  useEffect(() => {
    if (phase !== 'revealed' || !medalRef.current) return
    animate(medalRef.current, {
      scale: [{ to: 0.2 }, { to: 1.2 }, { to: 1 }],
      rotate: [{ to: -20 }, { to: 0 }],
      duration: 750,
      ease: 'outElastic(1, .55)',
    })
    if (haloRef.current) {
      animate(haloRef.current, {
        scale: [{ to: 0.8 }, { to: 1.15 }, { to: 0.95 }],
        opacity: [{ to: 0 }, { to: 1 }, { to: 0.75 }],
        duration: 900,
        ease: 'outCubic',
      })
      animate(haloRef.current, {
        scale: [{ to: 0.95 }, { to: 1.1 }, { to: 0.95 }],
        loop: true,
        duration: rarity === 'LEGENDARY' ? 1100 : 1800,
        delay: 900,
        ease: 'inOutSine',
      })
    }
  }, [phase, index, rarity])

  if (!badge) return null

  const openPack = () => {
    if (phase !== 'closed' || !packRef.current) return
    setPhase('charging')

    // charge up: rapid shake + scale punch, building anticipation — longer for rarer badges
    animate(packRef.current, {
      scale: [{ to: 1.22 }, { to: 1.1 }, { to: 1.22 }, { to: 1.1 }],
      rotate: [{ to: -6 }, { to: 6 }, { to: -5 }, { to: 5 }, { to: 0 }],
      duration: RARITY_CHARGE_MS[rarity],
      ease: 'inOutSine',
      onComplete: () => {
        setPhase('opening')
        setBurstKey((k) => k + 1)
        if (flashRef.current) {
          animate(flashRef.current, {
            scale: [{ to: 0 }, { to: RARITY_FLASH_SCALE[rarity] }],
            opacity: [{ to: 0.95 }, { to: 0 }],
            duration: 550,
            ease: 'outCubic',
          })
        }
        if (raysRef.current) {
          animate(raysRef.current, { opacity: [{ to: 0 }, { to: 1 }], duration: 400, ease: 'outQuad' })
        }
        if (packRef.current) {
          animate(packRef.current, {
            scale: [{ to: 1.3 }, { to: 0 }],
            rotate: '+=35',
            opacity: [{ to: 1 }, { to: 0 }],
            duration: 400,
            ease: 'inBack',
            onComplete: () => setPhase('revealed'),
          })
        }
      },
    })
  }

  const next = () => {
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1)
      setPhase('closed')
    } else {
      onDone()
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 overflow-hidden bg-black/85 px-4 backdrop-blur-sm">
      {queue.length > 1 && (
        <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">
          Badge {index + 1} / {queue.length}
        </p>
      )}

      <div className="relative flex size-72 items-center justify-center">
        {phase !== 'closed' && (
          <div
            ref={raysRef}
            className="pointer-events-none absolute size-[30rem] opacity-0"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${glow} 25deg, transparent 70deg, transparent 180deg, ${glow} 205deg, transparent 250deg, transparent 360deg)`,
            }}
          />
        )}

        <div
          ref={flashRef}
          className="pointer-events-none absolute size-24 rounded-full bg-white opacity-0"
        />

        {phase !== 'revealed' && (
          <button
            ref={packRef}
            type="button"
            onClick={openPack}
            disabled={phase !== 'closed'}
            className={cn(
              'relative flex h-52 w-40 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 bg-gradient-to-br text-white active:scale-95',
              RARITY_PACK_STYLE[rarity],
            )}
          >
            <div
              ref={shineRef}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/25"
            />
            <span className="text-4xl">🎁</span>
            <span className="text-[11px] font-bold tracking-wide uppercase">Nouveau badge</span>
            <span className="text-[10px] text-white/70">Touche pour ouvrir</span>
          </button>
        )}

        {phase === 'opening' && (
          <BurstParticles
            triggerKey={burstKey}
            count={RARITY_PARTICLE_COUNT[rarity]}
            spread={rarity === 'LEGENDARY' ? 420 : 320}
          />
        )}

        {phase === 'revealed' && (
          <>
            <div
              ref={haloRef}
              className="pointer-events-none absolute size-40 rounded-full opacity-0 blur-xl"
              style={{ backgroundColor: glow }}
            />
            <div
              ref={medalRef}
              className={cn(
                'relative flex size-32 items-center justify-center rounded-full border-4 text-5xl shadow-lg',
                RARITY_RING[rarity],
                rarity === 'LEGENDARY' && 'animate-legendary-pulse',
              )}
            >
              {badge.emoji}
            </div>
          </>
        )}
      </div>

      {phase === 'revealed' && (
        <div className="animate-pop-in flex max-w-xs flex-col items-center gap-1 text-center text-white">
          <p
            className={cn(
              'text-[11px] font-bold tracking-wide uppercase',
              rarity === 'LEGENDARY'
                ? 'text-amber-300'
                : rarity === 'EPIC'
                  ? 'text-purple-300'
                  : rarity === 'RARE'
                    ? 'text-sky-300'
                    : 'text-stone-300',
            )}
          >
            {RARITY_LABELS[rarity]} · Badge débloqué !
          </p>
          <p className="text-lg font-bold">{badge.title}</p>
          <p className="text-sm text-white/70">{badge.description}</p>
          <Button className="mt-4" onClick={next}>
            {index + 1 < queue.length ? 'Badge suivant' : 'Génial !'}
          </Button>
        </div>
      )}
    </div>
  )
}
