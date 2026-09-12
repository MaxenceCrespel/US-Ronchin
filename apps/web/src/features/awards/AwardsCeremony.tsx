import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Crown, Flame, Repeat, Shield, Sparkles, Star, Target, Trophy, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confetti } from '@/components/Confetti'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'
import type { AwardCategory, PlayerStats, TeamStats } from '@/lib/types'

// three.js + @react-three/fiber are a meaningful chunk of weight nothing else in the app
// needs — this keeps them out of the main bundle entirely until a season ceremony actually
// has a voted category to reveal (same reasoning as MonthlyTrophyReveal's own lazy import).
const CategoryTrophyScene = lazy(() =>
  import('./Trophy3D').then((m) => ({ default: m.CategoryTrophyScene })),
)

interface Props {
  season: string
  categories: AwardCategory[]
  teamStats: TeamStats
  /** Every active player's name — kept in the props for parity with the rest of the awards
   * feature even though the redesigned ceremony no longer scrolls a name reel. */
  roster: { firstName: string; lastName: string }[]
  /** The viewer's own season stats — powers the personal "Rewind" segment near the end.
   * Null for a non-playing coach or if the stats fetch failed; the segment is just skipped. */
  myStats: PlayerStats | null
  onDone: () => void
}

export interface PodiumEntry {
  firstName: string
  lastName: string
  value: number
}

type Step =
  | { kind: 'topScorer' }
  | { kind: 'topAssist' }
  | { kind: 'mostMotm' }
  | { kind: 'mostPatronDefense' }
  | { kind: 'mostPresent' }
  | { kind: 'category'; category: AwardCategory; index: number }
  | { kind: 'rewindIntro' }
  | { kind: 'rewind'; index: number }
  | { kind: 'outro' }

const CURTAIN_DURATION_S = 1.1

// The club's own blue/gold, gala-weighted toward the gold — this is US Ronchin's night,
// not a generic awards show.
export const GALA_CONFETTI_COLORS = ['#f4b400', '#ffd75e', '#ffffff', '#0089cf', '#005b8a']

export const SPRING_POP = { type: 'spring' as const, stiffness: 300, damping: 20 }

/** French plural of a stat unit — a word ending in s/x/z ("fois") never takes an extra "s". */
function pluralize(word: string, count: number): string {
  if (count <= 1 || /[sxz]$/i.test(word)) return word
  return `${word}s`
}

/* ------------------------------------------------------------------ *
 *  Shared visual primitives — the whole ceremony reads as one piece   *
 *  through these: brushed-gold headline type, a hairline-framed        *
 *  "plaque", and a spaced gold section label between two rules.        *
 * ------------------------------------------------------------------ */

/** Brushed-metal gold for headline words — a vertical gradient clipped to the text instead
 * of a flat fill with a glow, so it catches light like real gold leaf rather than looking
 * like a highlighter. */
export function GoldText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'bg-gradient-to-b from-[#ffd75e] via-[#f4b400] to-[#a87400] bg-clip-text text-transparent',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The category / segment label — small, wide-tracked, gold, sitting on a thin rule that
 * runs out to either side. Replaces the old shouty uppercase-with-glow treatment. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <span className="h-px max-w-16 flex-1 bg-gradient-to-r from-transparent to-[#f4b400]/60" />
      <span className="text-[11px] font-medium tracking-[0.28em] text-[#f4b400] uppercase">
        {children}
      </span>
      <span className="h-px max-w-16 flex-1 bg-gradient-to-l from-transparent to-[#f4b400]/60" />
    </div>
  )
}


/* ------------------------------------------------------------------ *
 *  Voted-trophy reveal — a real 3D trophy per category (see           *
 *  Trophy3D.tsx's CATEGORY_TROPHIES), not a flat plaque with an       *
 *  animation flourish: the crown for "Joueur de la saison", the       *
 *  butcher knife for "Boucher de l'équipe", a merguez for "Pire       *
 *  joueur"... the variety comes from *which trophy* appears, which   *
 *  is thematically meaningful, unlike five arbitrary reveal          *
 *  mechanics repeating regardless of what the category actually is.  *
 * ------------------------------------------------------------------ */

/** Fires `onRevealed` at most once — every variant below lands on its own timeline, this
 * just guards against a stray double-call (e.g. an interrupted effect re-running). */
export function useFireOnce(onRevealed: () => void) {
  const firedRef = useRef(false)
  return () => {
    if (firedRef.current) return
    firedRef.current = true
    onRevealed()
  }
}

export function RunnersUpList({ runners, show }: { runners: PodiumEntry[]; show: boolean }) {
  if (runners.length === 0) return null
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="flex flex-col items-center gap-1.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {runners.map((r, i) => (
            <p key={i} className="text-xs text-white/45">
              {i + 2}. {r.firstName} {r.lastName} · {r.value} {pluralize('vote', r.value)}
            </p>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CategoryTrophy3DReveal({
  category,
  winner,
  onRevealed,
}: {
  category: AwardCategory
  winner: PodiumEntry
  onRevealed: () => void
}) {
  const [spinning, setSpinning] = useState(false)
  const [nameShown, setNameShown] = useState(false)
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    const t1 = setTimeout(() => setSpinning(true), 250)
    const t2 = setTimeout(() => {
      setNameShown(true)
      fireOnce()
    }, 2500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        className="h-64 w-64"
        initial={{ opacity: 0, scale: 0.82, y: 10 }}
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
            categoryKey={category.key}
            spinning={spinning}
            period={category.season ?? undefined}
            className="size-full"
          />
        </Suspense>
      </motion.div>
      <AnimatePresence>
        {nameShown && (
          <motion.div
            className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <p
              className="text-2xl font-semibold tracking-tight text-white"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
            >
              {winner.firstName} {winner.lastName}
            </p>
            <p className="text-sm text-[#f4b400]">
              {winner.value} {pluralize('vote', winner.value)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CategoryReveal({
  category,
  onRevealed,
}: {
  category: AwardCategory
  onRevealed: () => void
}) {
  const ranked = useMemo(
    () =>
      (category.results ?? [])
        .filter((r) => r.votes > 0)
        .slice(0, 3)
        .map((r): PodiumEntry => ({ firstName: r.firstName, lastName: r.lastName, value: r.votes })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category.id],
  )
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    if (ranked.length === 0) fireOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.length])

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6">
        <SectionLabel>{category.title}</SectionLabel>
        <p className="text-white/60">Aucun vote exprimé.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <SectionLabel>{category.title}</SectionLabel>
      <CategoryTrophy3DReveal category={category} winner={ranked[0]} onRevealed={onRevealed} />
      <RunnersUpList runners={ranked.slice(1)} show />
    </div>
  )
}


/* ------------------------------------------------------------------ *
 *  Factual-stat podium — three lit tiers, built 3rd → 2nd → 1st.      *
 * ------------------------------------------------------------------ */

type StatTheme = 'goals' | 'assists' | 'motm' | 'defense' | 'presence'

const STAT_ICON: Record<StatTheme, typeof Target> = {
  goals: Target,
  assists: Sparkles,
  motm: Star,
  defense: Shield,
  presence: Flame,
}

const TIER_HEIGHT = { 0: 132, 1: 96, 2: 66 } as const
const TIER_SURFACE = [
  'bg-gradient-to-b from-[#ffd75e] to-[#f4b400] text-black',
  'bg-gradient-to-b from-[#e7e7ea] to-[#a9adb5] text-black',
  'bg-gradient-to-b from-[#d8a56b] to-[#9a6a34] text-white',
]
// A quick cascade, not a suspenseful build — 3rd → 2nd → 1st still land in that order (the
// eye still reads it as counting up to the winner) but the whole thing is done in well
// under a second. Five of these run back-to-back before the voted trophies even start, so
// repeating a slow multi-second build five times in a row was the "long et rébarbatif"
// complaint — this keeps the reveal recognizable without the wait.
const TIER_STAGGER_MS: Record<0 | 1 | 2, number> = { 2: 0, 1: 110, 0: 220 }
const PODIUM_SETTLE_MS = 620
const STEP_COLUMN_MIN_HEIGHT = 250

interface StatRevealVariantProps {
  ranked: PodiumEntry[]
  statLabel: string
  onRevealed: () => void
}

function PodiumTier({
  entry,
  rankIndex,
  statLabel,
  delayMs,
}: {
  entry: PodiumEntry
  rankIndex: 0 | 1 | 2
  statLabel: string
  delayMs: number
}) {
  const isFirst = rankIndex === 0
  const delay = delayMs / 1000
  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING_POP, delay }}
    >
      <div className="relative">
        <PlayerAvatar avatarUrl={null} firstName={entry.firstName} lastName={entry.lastName} size={isFirst ? 'lg' : 'md'} />
        {isFirst && (
          <motion.div
            className="absolute -top-5 left-1/2 -translate-x-1/2"
            initial={{ y: -12, opacity: 0, rotate: -12 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ ...SPRING_POP, delay: delay + 0.15 }}
          >
            <Crown className="size-5 fill-[#f4b400] text-[#f4b400]" />
          </motion.div>
        )}
      </div>
      <p className="max-w-20 truncate text-center text-xs font-medium text-white">
        {entry.firstName} {entry.lastName.slice(0, 1)}.
      </p>
      <p className="text-[11px] text-[#f4b400]">
        {entry.value} {pluralize(statLabel, entry.value)}
      </p>
      <div
        className={cn(
          'flex w-20 items-start justify-center rounded-t-md pt-2 text-xl font-semibold shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)]',
          TIER_SURFACE[rankIndex],
        )}
        style={{ height: TIER_HEIGHT[rankIndex] }}
      >
        {rankIndex + 1}
      </div>
    </motion.div>
  )
}

/** Stat reveal #1 — the classic three-tier podium, cascading in 3rd → 2nd → 1st. Assigned
 * to "Meilleur buteur", the headline stat, since it's the most immediately legible of the
 * five. */
function PodiumStepsReveal({ ranked, statLabel, onRevealed }: StatRevealVariantProps) {
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    const t = setTimeout(fireOnce, PODIUM_SETTLE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Classic podium order left-to-right (2nd, 1st, 3rd), but each tier's entrance is staggered
  // by TIER_STAGGER_MS so the eye still counts 3rd → 2nd → 1st even though every tier is
  // already in the DOM from the start — a cascade, not a wait-and-click build.
  const order: (0 | 1 | 2)[] = [1, 0, 2]

  return (
    <div className="flex items-end justify-center gap-3">
      {order
        .filter((rankIndex) => ranked[rankIndex])
        .map((rankIndex) => (
          <div
            key={rankIndex}
            className="flex w-20 flex-col items-center justify-end"
            style={{ minHeight: STEP_COLUMN_MIN_HEIGHT }}
          >
            <PodiumTier
              entry={ranked[rankIndex]}
              rankIndex={rankIndex}
              statLabel={statLabel}
              delayMs={TIER_STAGGER_MS[rankIndex]}
            />
          </div>
        ))}
    </div>
  )
}

/** Stat reveal #2 — a leaderboard of horizontal bars racing out to their length, gold for
 * 1st, the value ticking into view at the tip — reads as "data" rather than "athletics",
 * assigned to "Meilleur passeur" for a different texture right after the podium. */
function BarRaceReveal({ ranked, statLabel, onRevealed }: StatRevealVariantProps) {
  const fireOnce = useFireOnce(onRevealed)
  const max = ranked[0]?.value || 1

  useEffect(() => {
    const t = setTimeout(fireOnce, 250 + ranked.length * 260)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex w-72 flex-col gap-3">
      {ranked.map((entry, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.22, duration: 0.35 }}
        >
          <span className="w-4 text-right text-xs font-semibold text-white/45">{i + 1}</span>
          <PlayerAvatar avatarUrl={null} firstName={entry.firstName} lastName={entry.lastName} size="sm" />
          <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                i === 0 ? 'bg-gradient-to-r from-[#ffd75e] to-[#f4b400]' : 'bg-gradient-to-r from-white/45 to-white/20',
              )}
              initial={{ width: '0%' }}
              animate={{ width: `${Math.max((entry.value / max) * 100, 14)}%` }}
              transition={{ delay: i * 0.22 + 0.1, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-semibold text-white">
              {entry.value}
            </span>
          </div>
          <span className="w-16 shrink-0 truncate text-xs text-white/70">
            {entry.firstName} {entry.lastName.slice(0, 1)}.
          </span>
        </motion.div>
      ))}
      <p className="text-center text-[10px] text-white/35">{pluralize(statLabel, 2)}</p>
    </div>
  )
}

/** Stat reveal #3 — three medals popping into a triangular cluster under real 3D depth (2nd
 * and 3rd tilt in from either side, rotateY settling to face-on), rather than a linear
 * lineup — assigned to "Homme du match" for a star-studded-team-photo feel. */
function MedalClusterReveal({ ranked, statLabel, onRevealed }: StatRevealVariantProps) {
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    const t = setTimeout(fireOnce, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const layout = [
    { x: 0, y: -20, delay: 0.24, rotateY: 0 },
    { x: -78, y: 36, delay: 0.06, rotateY: -35 },
    { x: 78, y: 36, delay: 0.4, rotateY: 35 },
  ]

  return (
    <div className="relative flex h-44 w-72 items-center justify-center" style={{ perspective: 700 }}>
      {ranked.map((entry, i) => {
        const isFirst = i === 0
        const pos = layout[i]
        return (
          <motion.div
            key={i}
            className="absolute flex flex-col items-center gap-1"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ opacity: 0, scale: 0.3, x: pos.x, y: pos.y + 22, rotateY: pos.rotateY }}
            animate={{ opacity: 1, scale: isFirst ? 1.15 : 1, x: pos.x, y: pos.y, rotateY: 0 }}
            transition={{ ...SPRING_POP, delay: pos.delay }}
          >
            <div className="relative">
              <PlayerAvatar avatarUrl={null} firstName={entry.firstName} lastName={entry.lastName} size={isFirst ? 'lg' : 'md'} />
              {isFirst && (
                <Crown className="absolute -top-4 left-1/2 size-4 -translate-x-1/2 fill-[#f4b400] text-[#f4b400]" />
              )}
            </div>
            <p className="text-[11px] font-medium text-white">
              {entry.firstName} {entry.lastName.slice(0, 1)}.
            </p>
            <p className="text-[10px] text-[#f4b400]">
              {entry.value} {pluralize(statLabel, entry.value)}
            </p>
          </motion.div>
        )
      })}
    </div>
  )
}

/** A single split-flap-style digit — rotates in on its X axis from a blank tile, like an
 * old airport departure board. */
function FlipDigit({ value, delaySec }: { value: string; delaySec: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delaySec * 1000)
    return () => clearTimeout(t)
  }, [delaySec])
  return (
    <div
      style={{ perspective: 300 }}
      className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded bg-black/50 text-sm font-bold text-[#f4b400]"
    >
      <motion.span
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateX: -90, opacity: 0 }}
        animate={shown ? { rotateX: 0, opacity: 1 } : undefined}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        {value}
      </motion.span>
    </div>
  )
}

/** Stat reveal #4 — a scoreboard panel where each rank flips in like a split-flap display
 * tile, a broadcast-graphics texture distinct from the other four — assigned to "Patron de
 * la défense". */
function ScoreboardFlipReveal({ ranked, statLabel, onRevealed }: StatRevealVariantProps) {
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    const t = setTimeout(fireOnce, 400 + ranked.length * 260)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex w-72 flex-col gap-2 rounded-lg border border-[#f4b400]/30 bg-black/40 p-3">
      {ranked.map((entry, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.26 }}
        >
          <FlipDigit value={String(i + 1)} delaySec={i * 0.26} />
          <PlayerAvatar avatarUrl={null} firstName={entry.firstName} lastName={entry.lastName} size="sm" />
          <span className="flex-1 truncate text-sm text-white">
            {entry.firstName} {entry.lastName}
          </span>
          <span className="text-sm font-semibold text-[#f4b400]">
            {entry.value} {pluralize(statLabel, entry.value)}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

/** Stat reveal #5 — a list that fills from the bottom rank up, each row rising into place
 * on a brief gold light trail — assigned to "Meilleure assiduité", a stat that's
 * fundamentally about climbing steadily rather than a single flashy moment. */
function RisingTrailReveal({ ranked, statLabel, onRevealed }: StatRevealVariantProps) {
  const fireOnce = useFireOnce(onRevealed)

  useEffect(() => {
    const t = setTimeout(fireOnce, 350 + ranked.length * 240)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex w-64 flex-col gap-2.5">
      {ranked.map((entry, i) => (
        <motion.div
          key={i}
          className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#f4b400]/25 bg-white/[0.04] px-3 py-2"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          // 3rd rises first, 1st last — the list fills bottom-to-top in rank order even
          // though every row's final position is fixed from the start.
          transition={{ delay: (ranked.length - 1 - i) * 0.22, ...SPRING_POP }}
        >
          <motion.div
            className="pointer-events-none absolute inset-x-3 bottom-0 h-8 rounded-full bg-[#f4b400]/25 blur-md"
            initial={{ opacity: 0.6, scaleY: 1.6 }}
            animate={{ opacity: 0, scaleY: 0.4 }}
            transition={{ delay: (ranked.length - 1 - i) * 0.22, duration: 0.5 }}
          />
          <span className="text-xs font-semibold text-white/50">{i + 1}</span>
          <PlayerAvatar avatarUrl={null} firstName={entry.firstName} lastName={entry.lastName} size={i === 0 ? 'md' : 'sm'} />
          <span className="flex-1 truncate text-sm font-medium text-white">
            {entry.firstName} {entry.lastName}
          </span>
          <span className="text-xs text-[#f4b400]">
            {entry.value} {pluralize(statLabel, entry.value)}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

// Fixed one-per-theme so the same five stat categories always get a different mechanic each
// — topScorer/topAssist/mostMotm/mostPatronDefense/mostPresent always run in this order (see
// AwardsCeremony below), so keying by theme is equivalent to keying by position, but reads
// more clearly at the call site.
const STAT_REVEAL_BY_THEME: Record<StatTheme, (props: StatRevealVariantProps) => ReactNode> = {
  goals: PodiumStepsReveal,
  assists: BarRaceReveal,
  motm: MedalClusterReveal,
  defense: ScoreboardFlipReveal,
  presence: RisingTrailReveal,
}

function StatPodium({
  ranked,
  title,
  statLabel,
  theme,
  onRevealed,
}: {
  ranked: PodiumEntry[]
  title: string
  statLabel: string
  theme: StatTheme
  onRevealed: () => void
}) {
  const fireOnce = useFireOnce(onRevealed)
  const Icon = STAT_ICON[theme]

  useEffect(() => {
    if (ranked.length === 0) fireOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.length])

  const header = (
    <div className="flex flex-col items-center gap-4">
      <span className="flex size-12 items-center justify-center rounded-full border border-[#f4b400]/50 bg-[#f4b400]/10">
        <Icon className="size-5 text-[#f4b400]" />
      </span>
      <SectionLabel>{title}</SectionLabel>
    </div>
  )

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6">
        {header}
        <p className="text-white/60">Pas encore de données cette saison.</p>
      </div>
    )
  }

  const Variant = STAT_REVEAL_BY_THEME[theme]

  return (
    <div className="flex flex-col items-center gap-7">
      {header}
      <Variant ranked={ranked} statLabel={statLabel} onRevealed={onRevealed} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Closing recap — the whole night on one card.                       *
 * ------------------------------------------------------------------ */

interface RecapStatLine {
  label: string
  name: string
  display: string
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1.5 text-sm">
      <span className="text-[11px] tracking-wide text-white/45">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}

function CeremonyRecap({
  statLines,
  record,
  bestDuo,
  categories,
}: {
  statLines: RecapStatLine[]
  record: TeamStats['record']
  bestDuo: { scorerName: string; assistName: string; count: number } | null
  categories: AwardCategory[]
}) {
  const categoryLines = categories.map((c) => ({
    title: c.title,
    winner:
      c.results && c.results.length > 0 && c.results[0].votes > 0
        ? `${c.results[0].firstName} ${c.results[0].lastName}`
        : null,
  }))

  if (statLines.length === 0 && categoryLines.length === 0 && record.played === 0) return null

  return (
    <div className="flex max-h-80 w-72 flex-col divide-y divide-white/8 overflow-y-auto rounded-lg border border-[#f4b400]/40 bg-gradient-to-b from-white/[0.06] to-white/[0.01] px-5 py-4 text-left">
      {record.played > 0 && (
        <div className="pb-2 text-center text-xs text-white/55">
          <p>
            {record.played} {pluralize('match', record.played)} — {record.wins}V {record.draws}N {record.losses}D
          </p>
          <p className="mt-0.5">
            {record.goalsFor} {pluralize('but', record.goalsFor)} marqués · {record.goalsAgainst} encaissés
          </p>
        </div>
      )}

      {statLines.length > 0 && (
        <div className="py-1">
          {statLines.map((s) => (
            <RecapRow key={s.label} label={s.label} value={`${s.name} · ${s.display}`} />
          ))}
        </div>
      )}

      {bestDuo && (
        <div className="py-1">
          <RecapRow
            label="Duo de la saison"
            value={`${bestDuo.scorerName} → ${bestDuo.assistName} · ${bestDuo.count} fois`}
          />
        </div>
      )}

      {categoryLines.length > 0 && (
        <div className="py-1">
          {categoryLines.map((c) => (
            <RecapRow key={c.title} label={c.title} value={c.winner ?? '—'} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Personal "Rewind" — the viewer's own season, one figure a card.    *
 * ------------------------------------------------------------------ */

interface RewindCardData {
  icon: typeof Target
  big: string
  label: string
  sub?: string
}

function buildRewindCards(stats: PlayerStats, teamStats: TeamStats): RewindCardData[] {
  const cards: RewindCardData[] = []

  if (stats.matchesPlayed > 0) {
    cards.push({
      icon: Users,
      big: `${stats.matchesPlayed}`,
      label: stats.matchesPlayed > 1 ? 'matchs joués' : 'match joué',
    })
  }

  if (stats.goals > 0 || stats.assists > 0) {
    cards.push({
      icon: Target,
      big: `${stats.goals}`,
      label: `${pluralize('but', stats.goals)} ${stats.goals > 1 ? 'marqués' : 'marqué'}`,
      sub: stats.assists > 0 ? `+ ${stats.assists} ${pluralize('passe', stats.assists)} décisive${stats.assists > 1 ? 's' : ''}` : undefined,
    })
  }

  if (stats.trainingsResponded > 0) {
    cards.push({
      icon: Flame,
      big: `${Math.round((stats.trainingAttendanceRate ?? 0) * 100)}%`,
      label: 'de présence aux entraînements',
      sub: stats.presenceStreak > 1 ? `${stats.presenceStreak} d'affilée` : undefined,
    })
  }

  if (stats.averageRating !== null && stats.ratingsCount > 0) {
    cards.push({
      icon: Star,
      big: stats.averageRating.toFixed(1),
      label: 'de note moyenne sur 10',
      sub: `sur ${stats.ratingsCount} ${pluralize('note', stats.ratingsCount)}`,
    })
  }

  if (stats.motmCount > 0) {
    cards.push({
      icon: Trophy,
      big: `${stats.motmCount}`,
      label: 'fois homme du match',
    })
  }

  const rankings: [PlayerStats[], string][] = [
    [teamStats.topScorers, 'au classement des buteurs'],
    [teamStats.topAssists, 'au classement des passeurs'],
    [teamStats.mostPresent, "à l'assiduité"],
  ]
  for (const [list, label] of rankings) {
    const rank = list.findIndex((p) => p.userId === stats.userId)
    if (rank === -1) continue
    cards.push({ icon: Repeat, big: `#${rank + 1}`, label })
    break
  }

  return cards
}

function RewindIntroCard({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <SectionLabel>Rewind</SectionLabel>
      <h2 className="text-3xl font-semibold tracking-tight">
        <GoldText>Ton année, {firstName}</GoldText>
      </h2>
      <p className="text-white/60">Ta saison en quelques chiffres.</p>
    </div>
  )
}

function RewindCard({ card }: { card: RewindCardData }) {
  const Icon = card.icon
  return (
    <motion.div
      className="flex flex-col items-center gap-3"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_POP}
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-[#f4b400]/50 bg-[#f4b400]/10">
        <Icon className="size-5 text-[#f4b400]" />
      </span>
      <p className="text-6xl font-semibold tracking-tight">
        <GoldText>{card.big}</GoldText>
      </p>
      <p className="text-lg font-medium text-white">{card.label}</p>
      {card.sub && <p className="text-sm text-white/50">{card.sub}</p>}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 *  The ceremony itself — curtain, stage, and the run of reveals.      *
 * ------------------------------------------------------------------ */

/** Full-screen, once-a-season reveal. The club's own blue velvet curtain parts onto a lit stage; the
 * season's headline rankings and every voted trophy are shown one at a time, then the
 * viewer's own "Rewind", then a recap of the whole night. Mounted by
 * AwardsCeremonyWatcher the instant a closed-but-unseen season is detected — a snapshot of
 * that moment, not a live scoreboard. */
export function AwardsCeremony({ season, categories, teamStats, myStats, onDone }: Props) {
  const topScorersRanked: PodiumEntry[] = useMemo(
    () =>
      teamStats.topScorers
        .filter((p) => p.goals > 0)
        .slice(0, 3)
        .map((p) => ({ firstName: p.firstName, lastName: p.lastName, value: p.goals })),
    [teamStats.topScorers],
  )
  const topAssistsRanked: PodiumEntry[] = useMemo(
    () =>
      teamStats.topAssists
        .filter((p) => p.assists > 0)
        .slice(0, 3)
        .map((p) => ({ firstName: p.firstName, lastName: p.lastName, value: p.assists })),
    [teamStats.topAssists],
  )
  const mostMotmRanked: PodiumEntry[] = useMemo(
    () =>
      teamStats.mostMotm
        .filter((p) => p.motmCount > 0)
        .slice(0, 3)
        .map((p) => ({ firstName: p.firstName, lastName: p.lastName, value: p.motmCount })),
    [teamStats.mostMotm],
  )
  const mostPatronDefenseRanked: PodiumEntry[] = useMemo(
    () =>
      teamStats.mostPatronDefense
        .filter((p) => p.patronDefenseCount > 0)
        .slice(0, 3)
        .map((p) => ({ firstName: p.firstName, lastName: p.lastName, value: p.patronDefenseCount })),
    [teamStats.mostPatronDefense],
  )
  const mostPresentRanked: PodiumEntry[] = useMemo(
    () =>
      teamStats.mostPresent
        .filter((p) => p.trainingsPresent > 0)
        .slice(0, 3)
        .map((p) => ({ firstName: p.firstName, lastName: p.lastName, value: p.trainingsPresent })),
    [teamStats.mostPresent],
  )

  const topRatedEntry = teamStats.topRated[0]
  const bestDuoEntry = teamStats.bestDuos[0]

  const recapStatLines: RecapStatLine[] = [
    topScorersRanked[0] && {
      label: 'Meilleur buteur',
      name: `${topScorersRanked[0].firstName} ${topScorersRanked[0].lastName}`,
      display: `${topScorersRanked[0].value} ${pluralize('but', topScorersRanked[0].value)}`,
    },
    topAssistsRanked[0] && {
      label: 'Meilleur passeur',
      name: `${topAssistsRanked[0].firstName} ${topAssistsRanked[0].lastName}`,
      display: `${topAssistsRanked[0].value} ${pluralize('passe', topAssistsRanked[0].value)}`,
    },
    mostPresentRanked[0] && {
      label: 'Meilleure assiduité',
      name: `${mostPresentRanked[0].firstName} ${mostPresentRanked[0].lastName}`,
      display: `${mostPresentRanked[0].value} ${pluralize('entraînement', mostPresentRanked[0].value)}`,
    },
    topRatedEntry && {
      label: 'Meilleure note moyenne',
      name: `${topRatedEntry.firstName} ${topRatedEntry.lastName}`,
      display: `${topRatedEntry.averageRating?.toFixed(1)}/10`,
    },
    mostMotmRanked[0] && {
      label: 'Le plus souvent homme du match',
      name: `${mostMotmRanked[0].firstName} ${mostMotmRanked[0].lastName}`,
      display: `${mostMotmRanked[0].value} fois`,
    },
    mostPatronDefenseRanked[0] && {
      label: 'Le plus souvent patron de la défense',
      name: `${mostPatronDefenseRanked[0].firstName} ${mostPatronDefenseRanked[0].lastName}`,
      display: `${mostPatronDefenseRanked[0].value} fois`,
    },
  ].filter((l): l is RecapStatLine => !!l)

  const rewindCards: RewindCardData[] = useMemo(
    () => (myStats ? buildRewindCards(myStats, teamStats) : []),
    [myStats, teamStats],
  )

  const steps: Step[] = [
    ...(topScorersRanked.length > 0 ? [{ kind: 'topScorer' } as Step] : []),
    ...(topAssistsRanked.length > 0 ? [{ kind: 'topAssist' } as Step] : []),
    ...(mostMotmRanked.length > 0 ? [{ kind: 'mostMotm' } as Step] : []),
    ...(mostPatronDefenseRanked.length > 0 ? [{ kind: 'mostPatronDefense' } as Step] : []),
    ...(mostPresentRanked.length > 0 ? [{ kind: 'mostPresent' } as Step] : []),
    ...categories.map((category, index): Step => ({ kind: 'category', category, index })),
    ...(rewindCards.length > 0 ? [{ kind: 'rewindIntro' } as Step] : []),
    ...rewindCards.map((_, index): Step => ({ kind: 'rewind', index })),
    { kind: 'outro' },
  ]

  const [stepIndex, setStepIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [curtainOpen, setCurtainOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [burstKey, setBurstKey] = useState(0)
  const [confettiActive, setConfettiActive] = useState(false)
  const [canAdvance, setCanAdvance] = useState(true)

  // Fixed once — regenerating each render would make the dust jitter instead of drifting.
  const dust = useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        delay: Math.random() * 3,
      })),
    [],
  )

  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => setCurtainOpen(true), 220)
    return () => clearTimeout(t)
  }, [started])

  const step = steps[stepIndex]

  useEffect(() => {
    setConfettiActive(false)
    if (
      step.kind === 'category' ||
      step.kind === 'topScorer' ||
      step.kind === 'topAssist' ||
      step.kind === 'mostMotm' ||
      step.kind === 'mostPatronDefense' ||
      step.kind === 'mostPresent'
    ) {
      setCanAdvance(false)
    } else {
      setCanAdvance(true)
      if (step.kind === 'outro') {
        setBurstKey((k) => k + 1)
        setConfettiActive(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  function fireBurst() {
    setBurstKey((k) => k + 1)
    setCanAdvance(true)
    setConfettiActive(true)
  }

  function finish() {
    setClosing(true)
    setCurtainOpen(false)
    setTimeout(onDone, CURTAIN_DURATION_S * 1000)
  }

  function next() {
    if (stepIndex + 1 >= steps.length) {
      finish()
      return
    }
    setStepIndex((i) => i + 1)
  }

  const isLast = stepIndex + 1 >= steps.length

  return (
    <div className="fixed inset-0 z-[9998] overflow-hidden bg-black text-white">
      {/* Stage — a warm pool of light high-centre against a near-black room, a soft floor
          wash, and a heavy vignette so the edges fall away. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 55% at 50% 32%, #0d2438 0%, #061019 58%, #000 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: 'linear-gradient(to top, rgba(0,137,207,0.3), transparent)' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 240px 80px rgba(0,0,0,0.85)' }}
      />

      {/* Faint gold dust, always drifting — independent of the per-reveal confetti bursts. */}
      <div className="pointer-events-none absolute inset-0">
        {dust.map((d, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-[#f4b400]"
            style={{ top: `${d.top}%`, left: `${d.left}%`, width: d.size, height: d.size }}
            animate={{ opacity: [0.1, 0.7, 0.1], y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, delay: d.delay, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <Confetti key={burstKey} active={curtainOpen && confettiActive} colors={GALA_CONFETTI_COLORS} />

      {/* Curtain — two club-blue velvet panels with vertical fold shading and a scalloped
          valance across the top. Motion owns the transform so the many timers inside the
          reveal steps can never fight it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-10 bg-gradient-to-b from-[#003a5c] to-transparent" />
      <motion.div
        className="absolute inset-y-0 left-0 z-30 w-1/2 shadow-2xl"
        style={{
          background:
            'repeating-linear-gradient(90deg, #005b8a 0px, #0089cf 26px, #003a5c 52px, #005b8a 78px), linear-gradient(90deg, rgba(0,0,0,0.35), transparent 30%)',
        }}
        animate={{ x: curtainOpen ? '-100%' : '0%' }}
        transition={{ duration: CURTAIN_DURATION_S, ease: [0.45, 0, 0.15, 1] }}
      />
      <motion.div
        className="absolute inset-y-0 right-0 z-30 w-1/2 shadow-2xl"
        style={{
          background:
            'repeating-linear-gradient(90deg, #005b8a 0px, #0089cf 26px, #003a5c 52px, #005b8a 78px), linear-gradient(270deg, rgba(0,0,0,0.35), transparent 30%)',
        }}
        animate={{ x: curtainOpen ? '100%' : '0%' }}
        transition={{ duration: CURTAIN_DURATION_S, ease: [0.45, 0, 0.15, 1] }}
      />

      {curtainOpen && !closing && (
        <p className="absolute top-5 left-5 z-20 text-[11px] font-medium tracking-[0.25em] text-white/35 uppercase">
          Saison {season}
        </p>
      )}

      {/* Welcome — sits on the still-closed curtain until the viewer opens it themselves. */}
      {!started && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <span className="flex size-14 items-center justify-center rounded-full border border-[#f4b400]/50 bg-black/30">
            <Trophy className="size-6 text-[#f4b400]" />
          </span>
          <div>
            <p className="text-[11px] font-medium tracking-[0.28em] text-[#f4b400] uppercase">
              Saison {season}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              <GoldText>Cérémonie des trophées</GoldText>
            </h2>
            <p className="mt-3 max-w-xs text-white/60">
              Les classements de la saison et les trophées votés par l'équipe.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setStarted(true)}
            className="bg-club-gold hover:bg-club-gold/90 text-black"
          >
            Ouvrir le rideau
          </Button>
        </motion.div>
      )}

      <button
        type="button"
        onClick={finish}
        aria-label="Passer la cérémonie"
        className="absolute top-4 right-4 z-50 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white"
      >
        <X className="size-4" />
      </button>

      {curtainOpen && !closing && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-9 px-6 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col items-center gap-6"
            >
              {step.kind === 'topScorer' && (
                <StatPodium ranked={topScorersRanked} title="Meilleur buteur" statLabel="but" theme="goals" onRevealed={fireBurst} />
              )}
              {step.kind === 'topAssist' && (
                <StatPodium ranked={topAssistsRanked} title="Meilleur passeur" statLabel="passe" theme="assists" onRevealed={fireBurst} />
              )}
              {step.kind === 'mostMotm' && (
                <StatPodium ranked={mostMotmRanked} title="Homme du match" statLabel="fois" theme="motm" onRevealed={fireBurst} />
              )}
              {step.kind === 'mostPatronDefense' && (
                <StatPodium ranked={mostPatronDefenseRanked} title="Patron de la défense" statLabel="fois" theme="defense" onRevealed={fireBurst} />
              )}
              {step.kind === 'mostPresent' && (
                <StatPodium ranked={mostPresentRanked} title="Meilleure assiduité" statLabel="entraînement" theme="presence" onRevealed={fireBurst} />
              )}

              {step.kind === 'category' && (
                <CategoryReveal category={step.category} onRevealed={fireBurst} />
              )}

              {step.kind === 'rewindIntro' && <RewindIntroCard firstName={myStats?.firstName ?? ''} />}
              {step.kind === 'rewind' && <RewindCard card={rewindCards[step.index]} />}

              {step.kind === 'outro' && (
                <>
                  <span className="flex size-14 items-center justify-center rounded-full border border-[#f4b400]/50 bg-black/30">
                    <Trophy className="size-6 text-[#f4b400]" />
                  </span>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    <GoldText>Merci à tous</GoldText>
                  </h2>
                  <p className="text-white/60">Rendez-vous la saison prochaine.</p>
                  <CeremonyRecap
                    statLines={recapStatLines}
                    record={teamStats.record}
                    bestDuo={
                      bestDuoEntry
                        ? { scorerName: bestDuoEntry.scorerName, assistName: bestDuoEntry.assistName, count: bestDuoEntry.count }
                        : null
                    }
                    categories={categories}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <Button
            size="lg"
            onClick={next}
            disabled={!canAdvance}
            className="bg-club-gold hover:bg-club-gold/90 mt-1 text-black disabled:opacity-40"
          >
            {isLast ? 'Fermer' : 'Suivant'}
          </Button>
        </div>
      )}
    </div>
  )
}
