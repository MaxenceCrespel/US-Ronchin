import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BallIcon, BootIcon, YellowCardIcon, RedCardIcon } from './match-icons'
import { ratingColor, ratingLabel } from './rating-color'
import { toDisplayCase } from './name-format'

export interface PitchPlayer {
  compositionId: string
  firstName: string
  lastName: string
  /** 0–100, same formation coordinates already stored for the editable formation. */
  x: number
  y: number
  rating: number | null
  goals: number
  ownGoals: number
  assists: number
  yellow: number
  red: number
}

// Every size below (jersey, badges, name box, gaps between rows) was tuned in pixels against
// this reference width — the width of the approved mockup's phone frame — and that's also
// what keeps a tight midfield from overlapping: the proportions were proven not to collide at
// that size. Rather than re-deriving every number as a percentage (and fighting
// rounding/overlap again at each breakpoint), the canvas is kept fixed at this size and
// scaled as a whole to the actual card width, so it's pixel-identical to the mockup at 393px
// and uniformly smaller (never overlapping, never clipped) below that.
const DESIGN_WIDTH = 365
const DESIGN_HEIGHT = (DESIGN_WIDTH * 4) / 3

/** Read-only post-match recap — one jersey per starter, positioned exactly where the coach
 * placed them, with goals/assists/cards and the live rating average overlaid. Replaces the
 * plain colored-dot formation (PitchFormationEditor, still used for picking/editing the
 * lineup) once there's something to show besides "who played where". */
export function PostMatchPitchView({ players }: { players: PitchPlayer[] }) {
  // Only players who actually share a last name get the first-initial prefix — same rule
  // already used for "par Raphael D." in the attendance history, so two teammates named
  // Karada read as "S. Karada"/"M. Karada" instead of two identical "Karada" labels.
  const lastNameCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of players) {
      const lastName = toDisplayCase(p.lastName)
      counts[lastName] = (counts[lastName] ?? 0) + 1
    }
    return counts
  }, [players])

  // Measured with a ResizeObserver rather than a CSS container-query trick — the plain JS
  // measurement works the same on every browser, where cqw-based `calc()` scaling turned out
  // not to (it rendered the canvas at its unscaled 393px size on some real devices, throwing
  // the whole layout off instead of fitting it to the card).
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const applyScale = (width: number) => {
      if (width > 0) setScale(width / DESIGN_WIDTH)
    }
    applyScale(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width != null) applyScale(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="relative mx-auto aspect-[3/4] w-full max-w-2xl">
      <div
        className="absolute top-0 left-0"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Turf layer — rounded and clipped on its own, separately from the players below, so
            a name near an edge is never at the mercy of the pitch's own corner-rounding
            clip (belt-and-braces: the scaled canvas is already sized to match the container
            exactly, but this means a sub-pixel rounding difference can never cut a name
            off). */}
        <div className="absolute inset-0 overflow-hidden rounded-[20px] shadow-[inset_0_0_40px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 50% 10%, #3a7a46 0%, #2c6238 45%, #1f4a2c 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0, rgba(255,255,255,0.045) 11%, transparent 11%, transparent 22%)',
            }}
          />
          <div className="absolute inset-[10px] rounded-md border-2 border-white/30" />
          <div className="absolute top-1/2 right-[10px] left-[10px] h-0.5 -translate-y-1/2 bg-white/30" />
          <div className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30" />
          <div className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          <div className="absolute top-[10px] left-1/2 h-[52px] w-[152px] -translate-x-1/2 border-x-2 border-b-2 border-white/25" />
          <div className="absolute bottom-[10px] left-1/2 h-[52px] w-[152px] -translate-x-1/2 border-x-2 border-t-2 border-white/25" />
        </div>

        {players.map((p) => {
          const lastName = toDisplayCase(p.lastName)
          const displayName = lastNameCounts[lastName] > 1 ? `${p.firstName[0]}. ${lastName}` : lastName
          const goalBalls = Math.min(p.goals, 3)
          // The coach can place a formation dot anywhere from 0–100, including right on the
          // goal line — but the card below each jersey (rating pill + name) needs room to
          // breathe under it, and the cards/events cluster needs room above it. Clamping
          // keeps every player's full card inside the reference canvas.
          const displayX = Math.min(Math.max(p.x, 8), 92)
          const displayY = Math.min(Math.max(p.y, 8), 88)
          return (
            <div
              key={p.compositionId}
              className="absolute flex w-[84px] -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${displayX}%`, top: `${displayY}%` }}
            >
              <div className="relative h-[46px] w-[54px]">
                <svg
                  width={54}
                  height={46}
                  viewBox="0 0 42 36"
                  aria-hidden="true"
                  className="drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]"
                >
                  <defs>
                    <linearGradient id={`jersey-${p.compositionId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--club-blue)" />
                      <stop offset="1" stopColor="var(--club-blue-dark)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M15 2 L6 7 L9 13.5 L13.5 10.5 L13.5 30.5 Q13.5 33 16 33 L26 33 Q28.5 33 28.5 30.5 L28.5 10.5 L33 13.5 L36 7 L27 2 Q24 5.5 21 5.5 Q18 5.5 15 2 Z"
                    fill={`url(#jersey-${p.compositionId})`}
                    stroke="#0c1930"
                    strokeWidth="1"
                  />
                  <path
                    d="M17.3 3.1 Q21 6.6 24.7 3.1"
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M15 2 L6 7 L7.8 10"
                    fill="none"
                    stroke="var(--club-gold)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  <path
                    d="M27 2 L36 7 L34.2 10"
                    fill="none"
                    stroke="var(--club-gold)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                </svg>

                {/* Cards, top-left */}
                {(p.yellow > 0 || p.red > 0) && (
                  <div className="absolute -top-1 -left-2 z-[3] flex flex-col gap-0.5">
                    {p.yellow > 0 && <YellowCardIcon size={14} />}
                    {p.red > 0 && <RedCardIcon size={14} />}
                  </div>
                )}

                {/* Goals, own goal and assist flow top-to-bottom in one column from a fixed
                    left anchor — any combination stacks without fighting over pixel slots,
                    and the first goal never moves when a second/third is added. */}
                {(goalBalls > 0 || p.ownGoals > 0 || p.assists > 0) && (
                  <div className="absolute top-[-7px] left-[32px] z-[2] flex flex-col gap-0.5">
                    {goalBalls > 0 && (
                      <div className="relative h-[18px]" style={{ width: 11 * (goalBalls - 1) + 18 }}>
                        {Array.from({ length: goalBalls }).map((_, i) => (
                          <div key={i} className="absolute top-0" style={{ left: i * 11, zIndex: goalBalls - i }}>
                            <BallIcon size={18} />
                          </div>
                        ))}
                      </div>
                    )}
                    {p.ownGoals > 0 && <BallIcon size={17} fill="#EF4444" />}
                    {p.assists > 0 && <BootIcon size={17} />}
                  </div>
                )}
              </div>

              <div
                className="relative z-[4] -mt-2.5 flex h-6 min-w-[30px] items-center justify-center rounded-full px-1.5 text-center text-[13px] font-extrabold text-white shadow-[0_1px_3px_rgba(0,0,0,0.4),0_0_0_2px_#eef1f5] tabular-nums"
                style={{ background: p.rating == null ? '#94a3b8' : ratingColor(p.rating) }}
              >
                {ratingLabel(p.rating)}
              </div>
              <span className="mt-1 w-[84px] text-center text-xs leading-[1.15] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                {displayName}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
