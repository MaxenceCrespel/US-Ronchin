import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getMatchResult } from '@/lib/match-result'
import type { Match } from '@/lib/types'

const CLUB_NAME = 'US Ronchin'
const MAX_GOALS = 30

const RESULT_LABEL = { W: 'Victoire', D: 'Match nul', L: 'Défaite' } as const
const RESULT_CLASS = {
  W: 'bg-result-win text-white',
  D: 'bg-slate-500 text-white',
  L: 'bg-result-loss text-white',
} as const

function crest(name: string, isUs: boolean) {
  return isUs ? 'USR' : name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
}

/** Shows the real crest when one was scraped (see Match.homeLogo/awayLogo), falling back to
 * lettered initials — for a friendly, or when the CDN has no image for that club — rather than
 * a broken-image icon. */
function Crest({ name, isUs, logo, className }: { name: string; isUs: boolean; logo?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (isUs && (!logo || broken)) {
    return <img src="/club-logo.png" alt="" className={cn('size-9 shrink-0 object-contain', className)} />
  }
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        className={cn('bg-muted size-9 shrink-0 rounded-full object-contain', className)}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
        isUs ? 'bg-club-blue text-white' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {crest(name, isUs)}
    </div>
  )
}

/** Both teams in the order of the match sheet — the home side always on the left, so
 * "which number is whose" never depends on knowing the convention. */
function sides(match: Pick<Match, 'homeAway' | 'opponent' | 'homeLogo' | 'awayLogo'>) {
  const us = {
    key: 'us' as const,
    name: CLUB_NAME,
    isUs: true,
    logo: match.homeAway === 'HOME' ? match.homeLogo : match.awayLogo,
  }
  const them = {
    key: 'them' as const,
    name: match.opponent,
    isUs: false,
    logo: match.homeAway === 'HOME' ? match.awayLogo : match.homeLogo,
  }
  return match.homeAway === 'HOME' ? { left: us, right: them } : { left: them, right: us }
}

/** Coach score entry: one card per team (named, with its home/away role) and −/+ steppers
 * instead of two anonymous number fields, plus a sentence that reads the result back. */
export function ScoreEditor({
  match,
  scoreHome,
  scoreAway,
  onChange,
  onSave,
  saving,
  saved,
}: {
  match: Pick<Match, 'homeAway' | 'opponent' | 'homeLogo' | 'awayLogo'>
  scoreHome: number
  scoreAway: number
  onChange: (next: { scoreHome: number; scoreAway: number }) => void
  onSave: () => void
  saving: boolean
  /** The values on screen are exactly what's stored. */
  saved: boolean
}) {
  const { left, right } = sides(match)
  const value = (s: typeof left) => (match.homeAway === 'HOME') === s.isUs ? scoreHome : scoreAway
  const set = (s: typeof left, next: number) => {
    const clamped = Math.max(0, Math.min(MAX_GOALS, next))
    const isHomeSide = (match.homeAway === 'HOME') === s.isUs
    onChange(
      isHomeSide
        ? { scoreHome: clamped, scoreAway }
        : { scoreHome, scoreAway: clamped },
    )
  }
  const result = getMatchResult({ homeAway: match.homeAway, scoreHome, scoreAway })

  const card = (s: typeof left) => {
    const isHomeSide = (match.homeAway === 'HOME') === s.isUs
    const goals = value(s)
    return (
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg border-[1.5px] px-2 py-3',
          s.isUs ? 'border-club-blue/60 bg-club-blue/5' : 'bg-card',
        )}
      >
        <Crest name={s.name} isUs={s.isUs} logo={s.logo} />
        <span className="text-center text-sm leading-tight font-bold [overflow-wrap:anywhere]">
          {s.name}
        </span>
        <span
          className={cn(
            'text-xs font-bold tracking-wide uppercase',
            s.isUs ? 'text-club-blue' : 'text-muted-foreground',
          )}
        >
          {isHomeSide ? 'Domicile' : 'Extérieur'}
          {s.isUs && ' · nous'}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 rounded-full"
            aria-label={`Retirer un but à ${s.name}`}
            disabled={goals === 0}
            onClick={() => set(s, goals - 1)}
          >
            <Minus className="size-4" />
          </Button>
          <span className="font-display min-w-8 text-center text-5xl leading-none font-extrabold tabular-nums">
            {goals}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 rounded-full"
            aria-label={`Ajouter un but à ${s.name}`}
            onClick={() => set(s, goals + 1)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        L'équipe qui reçoit est à gauche, comme sur la feuille de match.
      </p>
      <div className="flex items-stretch gap-2">
        {card(left)}
        <span className="text-muted-foreground flex items-center text-xl font-bold">–</span>
        {card(right)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-semibold">
        {result && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', RESULT_CLASS[result])}>
            {RESULT_LABEL[result]}
          </span>
        )}
        <span>
          {left.name} <b>{value(left)}</b> – <b>{value(right)}</b> {right.name}
        </span>
      </div>
      <span role="status" className="sr-only">
        {saved ? 'Score enregistré' : ''}
      </span>
      {saved ? (
        <Button
          disabled
          className="w-full bg-emerald-600 text-white disabled:opacity-100"
        >
          <Check className="size-4" /> Score enregistré
        </Button>
      ) : (
        <Button className="w-full" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer le score'}
        </Button>
      )}
    </div>
  )
}

/** Read-only final score with both team names, same left/right order as the editor. On the
 * dark match header (`tone="dark"`) it becomes the scoreboard: crests stacked over the names
 * and the score in large condensed type. */
export function FinalScore({
  match,
  tone = 'light',
}: {
  match: Pick<Match, 'homeAway' | 'opponent' | 'scoreHome' | 'scoreAway' | 'homeLogo' | 'awayLogo'>
  tone?: 'light' | 'dark'
}) {
  const { left, right } = sides(match)
  const goals = (s: typeof left) =>
    (match.homeAway === 'HOME') === s.isUs ? match.scoreHome : match.scoreAway
  const result = getMatchResult(match)
  const dark = tone === 'dark'
  const team = (s: typeof left) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <Crest name={s.name} isUs={s.isUs} logo={s.logo} className={dark ? 'size-12' : undefined} />
      <span className={cn('font-display w-full truncate font-bold uppercase', dark ? 'text-base' : 'text-sm')}>
        {s.name}
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {team(left)}
        <div className="font-display flex shrink-0 items-center gap-2 italic">
          <span className={cn('leading-none font-extrabold tabular-nums', dark ? 'text-6xl' : 'text-4xl')}>
            {goals(left) ?? '-'}
          </span>
          <span className={cn('text-2xl font-bold', dark ? 'text-white/50' : 'text-muted-foreground')}>–</span>
          <span className={cn('leading-none font-extrabold tabular-nums', dark ? 'text-6xl' : 'text-4xl')}>
            {goals(right) ?? '-'}
          </span>
        </div>
        {team(right)}
      </div>
      {result && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <span className={cn('rounded-full px-2.5 py-0.5 font-bold', RESULT_CLASS[result])}>
            {RESULT_LABEL[result]}
          </span>
          <span className={dark ? 'text-white/80' : 'text-muted-foreground'}>
            {match.homeAway === 'HOME' ? 'À domicile' : "À l'extérieur"}
          </span>
        </div>
      )}
    </div>
  )
}
