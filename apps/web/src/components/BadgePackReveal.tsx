import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BadgeRarity, BadgeStatus } from '@/lib/types'
import { RARITY_LABELS } from '@/features/badges/BadgesGrid'

type Phase = 'closed' | 'charging' | 'opening' | 'revealed'

interface OrbitRing {
  count: number
  r: number
  dur: number
  dir: 'normal' | 'reverse'
}

interface RarityConfig {
  c1: string
  c2: string
  c3: string
  glow: string
  labelColor: string
  /** 0-3, common to legendary — drives how much of the reveal escalates (see each field
   * below): a common badge should read as modest, a legendary one as a real spectacle,
   * not just a different color of the exact same effect. */
  tier: number
  tiltAmp: number
  tiltScale: number
  rimPad: number
  pedestal: { w: number; h: number; o: number }
  orbitRings: OrbitRing[]
  charge: number
  shards: number
  sparks: number
  flashScale: number
}

const RARITY_CONFIG: Record<BadgeRarity, RarityConfig> = {
  COMMON: {
    c1: '#e7ebef', c2: '#9aa3ad', c3: '#5b6470', glow: 'rgba(180,190,200,0.55)', labelColor: '#c7ccd2',
    tier: 0, tiltAmp: 5, tiltScale: 1.01, rimPad: 5,
    pedestal: { w: 170, h: 36, o: 0.5 },
    orbitRings: [],
    charge: 420, shards: 8, sparks: 10, flashScale: 2.6,
  },
  RARE: {
    c1: '#bfe6fb', c2: '#38a3d1', c3: '#0d4f73', glow: 'rgba(56,169,225,0.6)', labelColor: '#7dd3fc',
    tier: 1, tiltAmp: 7, tiltScale: 1.02, rimPad: 6,
    pedestal: { w: 200, h: 42, o: 0.65 },
    orbitRings: [{ count: 4, r: 100, dur: 4.5, dir: 'normal' }],
    charge: 520, shards: 12, sparks: 16, flashScale: 3,
  },
  EPIC: {
    c1: '#ecd6ff', c2: '#a855f7', c3: '#54208a', glow: 'rgba(168,85,247,0.65)', labelColor: '#d8b4fe',
    tier: 2, tiltAmp: 10, tiltScale: 1.035, rimPad: 7,
    pedestal: { w: 235, h: 48, o: 0.75 },
    orbitRings: [
      { count: 5, r: 88, dur: 4, dir: 'normal' },
      { count: 4, r: 118, dur: 6, dir: 'reverse' },
    ],
    charge: 640, shards: 18, sparks: 22, flashScale: 3.5,
  },
  LEGENDARY: {
    c1: '#fff3c4', c2: '#f4b400', c3: '#8a5a00', glow: 'rgba(244,180,0,0.8)', labelColor: '#f4b400',
    tier: 3, tiltAmp: 13, tiltScale: 1.05, rimPad: 9,
    pedestal: { w: 270, h: 54, o: 0.9 },
    orbitRings: [
      { count: 7, r: 92, dur: 3.5, dir: 'normal' },
      { count: 6, r: 124, dur: 5.5, dir: 'reverse' },
    ],
    charge: 860, shards: 26, sparks: 32, flashScale: 4.4,
  },
}

interface Fragment {
  id: string
  dx: number
  dy: number
  rot: number
  delay: number
}

function buildFragments(count: number): Fragment[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
    const dist = 90 + Math.random() * 140
    return {
      id: `${i}-${Math.random()}`,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      rot: (Math.random() - 0.5) * 480,
      delay: Math.random() * 60,
    }
  })
}

/** Full-screen "sealed medallion" reveal for newly-earned badges — tap the seal, watch it
 * crack and shatter into light, then the badge settles as a metallic coin that keeps
 * tilting gently in place. Every layer of the effect (ray shafts, orbiting sparkles, the
 * coin's own tilt/shimmer, the ground glow beneath it) scales up with rarity — common is
 * deliberately understated, legendary is the full spectacle — so the escalation reads at a
 * glance instead of just being a different accent color on an identical animation. */
export function BadgePackReveal({ queue, onDone }: { queue: BadgeStatus[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('closed')
  const [coinActive, setCoinActive] = useState(false)
  const [shards, setShards] = useState<Fragment[]>([])
  const [sparks, setSparks] = useState<Fragment[]>([])

  const badge = queue[index]
  const rarity: BadgeRarity = badge?.rarity ?? 'COMMON'
  const cfg = RARITY_CONFIG[rarity]

  // Phase sequencing — each phase arms the next one after its own duration, mirroring the
  // old anime.js timeline but driven by plain state instead of imperative refs.
  useEffect(() => {
    if (phase === 'charging') {
      const t = setTimeout(() => setPhase('opening'), cfg.charge)
      return () => clearTimeout(t)
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('revealed'), 260)
      return () => clearTimeout(t)
    }
    if (phase === 'revealed') {
      // Hands the medal's transform over to the idle coin-tilt loop once the pop settles.
      const t = setTimeout(() => setCoinActive(true), 800)
      return () => clearTimeout(t)
    }
  }, [phase, cfg.charge])

  useEffect(() => {
    if (phase !== 'opening') return
    setShards(buildFragments(cfg.shards))
    setSparks(buildFragments(cfg.sparks))
    const t = setTimeout(() => {
      setShards([])
      setSparks([])
    }, 1200)
    return () => clearTimeout(t)
  }, [phase, cfg.shards, cfg.sparks])

  if (!badge) return null

  const openPack = () => {
    if (phase !== 'closed') return
    setPhase('charging')
  }

  const next = () => {
    setPhase('closed')
    setCoinActive(false)
    setShards([])
    setSparks([])
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1)
    } else {
      onDone()
    }
  }

  const opened = phase === 'opening' || phase === 'revealed'
  const revealed = phase === 'revealed'

  return (
    // pointer-events-auto: this mounts at the app root, outside any Radix dialog, and a
    // modal Dialog (e.g. the mandatory "Notes/Vote obligatoire" one on the match page)
    // sets pointer-events: none on <body> for everything outside itself. A badge unlocked
    // by that very submit lands here while the modal is still open/closing — without this
    // override the "Touche pour révéler" tap is silently swallowed.
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 overflow-hidden bg-black px-4"
      data-tier={cfg.tier}
    >
      {queue.length > 1 && (
        <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">
          Badge {index + 1} / {queue.length}
        </p>
      )}

      <div className="badge-reveal-stage relative flex size-72 items-center justify-center">
        <div
          className={cn('badge-reveal-rays', opened && 'show')}
          style={{ background: `repeating-conic-gradient(from 0deg, ${cfg.glow} 0deg 1.4deg, transparent 1.4deg 30deg)` }}
        />
        <div
          className={cn('badge-reveal-rays2', opened && 'show')}
          style={{ background: `repeating-conic-gradient(from 15deg, ${cfg.glow} 0deg 1deg, transparent 1deg 22deg)` }}
        />

        <div
          className={cn('badge-reveal-flash', phase === 'opening' && 'burst')}
          style={{ '--flash-scale': cfg.flashScale } as CSSProperties}
        />

        <div
          className={cn('badge-reveal-medal-wrap', phase === 'closed' && 'idle-breathe', phase === 'charging' && 'charging')}
          style={{ '--charge-ms': `${cfg.charge}ms` } as CSSProperties}
        >
          <div className={cn('badge-reveal-seal', phase !== 'closed' && 'cracking', opened && 'shattered')}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.4">
              <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
            </svg>
            <span className={cn('badge-reveal-tap-hint', phase !== 'closed' && 'hide')}>
              Touche pour révéler
            </span>
          </div>

          <div
            className={cn('badge-reveal-halo', revealed && 'show')}
            style={{ background: `radial-gradient(circle, ${cfg.glow}, transparent 70%)` }}
          />

          <div className={cn('badge-reveal-orbit', revealed && 'show')}>
            {cfg.orbitRings.flatMap((ring, ringIdx) =>
              Array.from({ length: ring.count }, (_, i) => (
                <span
                  key={`${ringIdx}-${i}`}
                  style={{
                    '--orbit-r': `${ring.r}px`,
                    '--orbit-dur': `${ring.dur}s`,
                    '--orbit-dir': ring.dir,
                    animationDelay: `${-(i / ring.count) * ring.dur}s`,
                    background: cfg.c1,
                    boxShadow: `0 0 6px 1px ${cfg.glow}`,
                  } as CSSProperties}
                />
              )),
            )}
          </div>

          {shards.map((f) => (
            <div
              key={f.id}
              className="badge-reveal-shard fly"
              style={{
                '--dx': `${f.dx}px`,
                '--dy': `${f.dy}px`,
                '--rot': `${f.rot}deg`,
                animationDelay: `${f.delay}ms`,
                background: `linear-gradient(135deg, ${cfg.c1}, ${cfg.c2})`,
              } as CSSProperties}
            />
          ))}
          {sparks.map((f, i) => {
            const size = 3 + ((i * 37) % 100) / 100 * 4
            return (
              <div
                key={f.id}
                className="badge-reveal-spark fly"
                style={{
                  '--dx': `${f.dx}px`,
                  '--dy': `${f.dy}px`,
                  width: size,
                  height: size,
                  animationDelay: `${f.delay}ms`,
                  background: i % 2 === 0 ? cfg.c1 : '#fff',
                  boxShadow: `0 0 8px 1px ${cfg.glow}`,
                } as CSSProperties}
              />
            )
          })}

          <div
            className={cn('badge-reveal-medal', opened && 'show', coinActive && 'idle-coin')}
            style={{
              '--c1': cfg.c1,
              '--c2': cfg.c2,
              '--c3': cfg.c3,
              '--tilt-amp': `${cfg.tiltAmp}deg`,
              '--tilt-scale': cfg.tiltScale,
              '--rim-pad': `${cfg.rimPad}px`,
            } as CSSProperties}
          >
            <div className="badge-reveal-edge" />
            <div className="badge-reveal-rim" />
            <div className="badge-reveal-bevel" />
            <div className="badge-reveal-face">
              <div className="badge-reveal-gloss" />
              <div className="badge-reveal-sweep" />
              <div className="badge-reveal-sweep2" />
              <span className="relative z-[2] text-5xl drop-shadow-[0_3px_5px_rgba(0,0,0,0.45)]">
                {badge.emoji}
              </span>
            </div>
          </div>

          {phase === 'closed' && (
            <button
              type="button"
              onClick={openPack}
              aria-label="Révéler le badge"
              className="absolute -inset-5 z-[6] cursor-pointer rounded-full"
            />
          )}
        </div>

        <div
          className={cn('badge-reveal-pedestal', revealed && 'show')}
          style={{
            width: cfg.pedestal.w,
            height: cfg.pedestal.h,
            '--pedestal-opacity': cfg.pedestal.o,
            background: `radial-gradient(ellipse, ${cfg.glow}, transparent 72%)`,
          } as CSSProperties}
        />
      </div>

      {revealed && (
        <div className="badge-reveal-info flex max-w-xs flex-col items-center gap-1.5 text-center text-white">
          <p
            className="text-[11px] font-bold tracking-[0.25em] uppercase"
            style={{ color: cfg.labelColor }}
          >
            {RARITY_LABELS[rarity]} · Badge débloqué !
          </p>
          <span className="h-0.5 w-8 rounded-full opacity-70" style={{ background: cfg.labelColor }} />
          <p className="text-xl font-extrabold tracking-tight">
            {badge.title}
            {badge.count > 1 && <span className="text-white/70"> ×{badge.count}</span>}
          </p>
          <p className="text-sm text-white/70">{badge.description}</p>
          <Button
            className="mt-4 bg-[linear-gradient(180deg,#ffdf66_0%,var(--club-gold)_55%,#b8850a_100%)] font-extrabold text-[#1a1200] shadow-[0_10px_24px_-8px_rgba(244,180,0,0.55),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_2px_rgba(0,0,0,0.15)] hover:opacity-95"
            onClick={next}
          >
            {index + 1 < queue.length ? 'Badge suivant' : 'Génial !'}
          </Button>
        </div>
      )}
    </div>
  )
}
