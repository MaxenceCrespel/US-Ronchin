import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleHelp, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { setPlayerRating } from './ratings-api'
import { usePendingPlayerRatings } from './usePendingPlayerRatings'
import { usePlayerRatingsDraft } from './usePlayerRatingsDraft'
import { RATING_LEVELS, formatRating, ratingLevel } from './player-rating-scale'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Locks/unlocks page scroll while a modal below is open, and swallows the first tap right
 * after it closes — a closing "J'ai compris" tap can otherwise land on whatever sits behind
 * it (a rating pill, the search field) the instant the modal disappears. */
function useModalGuard(open: boolean) {
  const [justClosed, setJustClosed] = useState(false)
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])
  const close = (after: () => void) => {
    after()
    setJustClosed(true)
    window.setTimeout(() => setJustClosed(false), 400)
  }
  return { justClosed, close }
}

export function PlayerRatingsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { players, isLoading } = usePendingPlayerRatings()
  const { draft, setValue, clear } = usePlayerRatingsDraft(user?.id)

  const introKey = user ? `player-ratings-intro-seen:${user.id}` : null
  const [showIntro, setShowIntro] = useState(false)
  useEffect(() => {
    if (!introKey) return
    setShowIntro(localStorage.getItem(introKey) !== '1')
  }, [introKey])
  const introGuard = useModalGuard(showIntro)

  const [showLegend, setShowLegend] = useState(false)
  const legendGuard = useModalGuard(showLegend)

  const [showInfo, setShowInfo] = useState(false)
  const infoGuard = useModalGuard(showInfo)

  const [showRecap, setShowRecap] = useState(false)
  const recapGuard = useModalGuard(showRecap)

  const [activeLevel, setActiveLevel] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'todo'>('all')
  const [justSaved, setJustSaved] = useState(false)
  const h1Ref = useRef<HTMLHeadingElement>(null)

  // A player still shown under "À noter" even once rated in this session — the list must
  // not jump under the coach's thumb while they're still working through it (see the
  // conversation this was built from: "c'est super chiant le tri qui bouge tout le temps").
  const [todoIdsAtFilterTime, setTodoIdsAtFilterTime] = useState<string[]>([])

  const effective = useMemo(
    () => players.map((p) => ({ ...p, effectiveRating: draft[p.userId] ?? p.rating })),
    [players, draft],
  )
  const missing = effective.filter((p) => p.effectiveRating == null)
  const dirty = effective.filter((p) => p.effectiveRating !== p.rating)
  const allRated = missing.length === 0

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(dirty.map((p) => setPlayerRating(p.userId, p.effectiveRating as number)))
    },
    onSuccess: () => {
      clear()
      setJustSaved(true)
      setShowRecap(false)
      queryClient.invalidateQueries({ queryKey: ['player-ratings'] })
    },
  })

  const rows = effective
    .filter((p) => (filter === 'todo' ? todoIdsAtFilterTime.includes(p.userId) : true))
    .filter((p) => (query ? normalize(`${p.firstName} ${p.lastName}`).includes(normalize(query)) : true))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fr'))

  const closeIntro = () => {
    if (introKey) localStorage.setItem(introKey, '1')
    introGuard.close(() => setShowIntro(false))
    h1Ref.current?.focus()
  }

  const rate = (userId: string, value: number) => {
    setJustSaved(false)
    setValue(userId, value)
  }

  const recapGroups = useMemo(() => {
    const groups = new Map<number, string[]>()
    for (const p of effective) {
      if (p.effectiveRating == null) continue
      const list = groups.get(p.effectiveRating) ?? []
      list.push(`${p.firstName} ${p.lastName}`)
      groups.set(p.effectiveRating, list)
    }
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rating, names]) => ({ rating, names: names.sort((a, b) => a.localeCompare(b, 'fr')) }))
  }, [effective])

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center" role="status">
        <span className="sr-only">Chargement…</span>
        <div className="border-club-blue size-8 animate-spin rounded-full border-4 border-t-transparent" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'mx-auto flex max-w-xl flex-col gap-3.5 pb-28',
        (introGuard.justClosed || legendGuard.justClosed || recapGuard.justClosed || infoGuard.justClosed) &&
          'pointer-events-none',
      )}
    >
      <div>
        <h1 ref={h1Ref} tabIndex={-1} className="text-xl font-bold outline-none">
          Noter les joueurs
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Note chaque joueur, puis enregistre tout d'un coup. Tes notes sont privées.
        </p>
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="text-club-blue-dark mt-1.5 flex items-center gap-1 text-xs font-semibold underline"
        >
          <CircleHelp className="size-3.5 shrink-0" aria-hidden="true" />À quoi sert cette note ?
        </button>
      </div>

      {/* Scale strip — sticky so it stays visible while scrolling the list, instead of a
          one-off screen the coach can't refer back to mid-way through rating everyone. */}
      <div className="bg-background sticky top-0 z-10 -my-1 flex flex-col gap-1.5 border-b py-2">
        <div className="grid grid-cols-10 gap-1">
          {RATING_LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setActiveLevel(l.value)}
              aria-pressed={activeLevel === l.value}
              aria-label={`Niveau ${l.value} : ${l.label}`}
              style={{ backgroundColor: l.color }}
              className={cn(
                'h-8 rounded-md text-xs font-extrabold text-white opacity-90',
                activeLevel === l.value && 'ring-foreground opacity-100 ring-2 ring-offset-1',
              )}
            >
              {l.value}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground min-h-8 flex-1 text-xs leading-snug" aria-live="polite">
            {activeLevel ? (
              <>
                <strong className="text-foreground">
                  {activeLevel} · {ratingLevel(activeLevel).label}
                </strong>{' '}
                — {ratingLevel(activeLevel).description}
              </>
            ) : (
              'Touche un chiffre pour voir sa signification.'
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowLegend(true)}
            className="text-club-blue-dark shrink-0 text-xs font-semibold whitespace-nowrap underline"
          >
            Tout voir
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          placeholder="Rechercher un joueur"
          aria-label="Rechercher un joueur par nom"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-40 flex-1"
        />
        <div className="bg-muted flex rounded-md border p-0.5">
          {(
            [
              { key: 'all', label: 'Tous' },
              { key: 'todo', label: 'À noter' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                if (f.key === 'todo') setTodoIdsAtFilterTime(missing.map((p) => p.userId))
                setFilter(f.key)
              }}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-semibold',
                filter === f.key ? 'bg-club-blue text-white' : 'text-muted-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.length === 0 && (
          <li className="text-muted-foreground py-6 text-center text-sm">
            {query ? `Aucun joueur ne correspond à « ${query} ».` : 'Tous les joueurs sont notés.'}
          </li>
        )}
        {rows.map((p) => {
          const whole = p.effectiveRating == null ? null : Math.floor(p.effectiveRating)
          const half = p.effectiveRating != null && p.effectiveRating % 1 !== 0
          const name = `${p.firstName} ${p.lastName}`.trim()
          return (
            <li key={p.userId} className="rounded-xl border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{name}</span>
                <span className={cn('text-xs font-semibold', p.effectiveRating != null ? 'text-club-blue-dark' : 'text-muted-foreground')}>
                  {p.effectiveRating != null
                    ? `${formatRating(p.effectiveRating)} · ${ratingLevel(p.effectiveRating).label}`
                    : 'Pas encore noté'}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-11 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={whole === n}
                    aria-label={`Note ${n} pour ${name}`}
                    onClick={() => rate(p.userId, half && whole === n ? n + 0.5 : n)}
                    className={cn(
                      'h-9 rounded-md border text-sm font-semibold tabular-nums',
                      whole === n ? 'bg-club-blue border-club-blue text-white' : 'bg-muted/40',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={half}
                  aria-label={`Ajouter un demi-point pour ${name}`}
                  disabled={p.effectiveRating == null}
                  onClick={() => rate(p.userId, half ? Math.floor(p.effectiveRating as number) : Math.min((p.effectiveRating as number) + 0.5, 10))}
                  className={cn(
                    'h-9 rounded-md border text-xs font-semibold disabled:opacity-40',
                    half ? 'bg-club-blue-dark border-club-blue-dark text-white' : 'bg-background',
                  )}
                >
                  +½
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className="text-muted-foreground flex-1 text-xs leading-snug" aria-live="polite">
            {!allRated ? (
              <>
                <strong className="text-foreground">
                  Il reste {missing.length} joueur{missing.length > 1 ? 's' : ''} à noter
                </strong>
              </>
            ) : dirty.length > 0 ? (
              <strong className="text-foreground">Tout est noté. Vérifie puis enregistre</strong>
            ) : justSaved ? (
              <strong className="text-foreground">Notes enregistrées. Merci !</strong>
            ) : (
              'Aucune modification'
            )}
          </p>
          {dirty.length > 0 && allRated && (
            <button type="button" onClick={() => clear()} className="text-club-blue-dark text-xs font-semibold underline">
              Annuler
            </button>
          )}
          <Button
            type="button"
            disabled={!allRated || dirty.length === 0}
            onClick={() => setShowRecap(true)}
            className={cn(
              'relative overflow-hidden font-bold whitespace-nowrap',
              !allRated && 'bg-muted text-muted-foreground',
              allRated && dirty.length === 0 && justSaved && 'bg-emerald-700 text-white hover:bg-emerald-700',
            )}
          >
            {!allRated && (
              <span
                className="bg-club-blue/25 absolute inset-y-0 left-0"
                style={{ width: `${((players.length - missing.length) / Math.max(players.length, 1)) * 100}%` }}
                aria-hidden="true"
              />
            )}
            <span className="relative">
              {!allRated
                ? `Enregistrer · ${players.length - missing.length}/${players.length}`
                : allRated && dirty.length === 0 && justSaved
                  ? '✓ Enregistré'
                  : 'Enregistrer mes notes'}
            </span>
          </Button>
        </div>
      </div>

      {/* Mandatory intro — first visit only, closed only by its own button. */}
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ratings-intro-title">
          <div className="bg-background flex w-full max-w-lg flex-col gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
            <h2 id="ratings-intro-title" className="text-lg font-bold text-balance">
              Avant de commencer
            </h2>
            <ul className="flex list-disc flex-col gap-2 pl-4.5 text-sm leading-relaxed">
              <li>
                Ta note sert de <strong>base</strong> pour calculer le niveau de chaque joueur, utilisé notamment pour{' '}
                <strong>équilibrer les équipes</strong> à l'entraînement. Elle compte surtout tant qu'il n'a pas encore
                beaucoup joué : ses vraies performances prennent ensuite progressivement le relais.
              </li>
              <li>
                Note le <strong>niveau général</strong> de chaque joueur de <strong>1 à 10</strong>, tel que tu le vois sur le
                terrain. Pas ses stats, ni sa présence à l'entraînement.
              </li>
              <li>
                Tes notes sont <strong>privées</strong>. Tu ne vois aucun niveau calculé, pour ne pas être influencé.
              </li>
              <li>
                Tu dois noter <strong>tous les joueurs</strong>, puis <strong>tout enregistrer d'un coup</strong>. L'échelle reste
                affichée en haut de la liste.
              </li>
            </ul>
            <Button type="button" onClick={closeIntro} className="mt-1">
              J'ai compris, je commence
            </Button>
          </div>
        </div>
      )}

      {/* Full legend */}
      {showLegend && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ratings-legend-title"
          onClick={() => legendGuard.close(() => setShowLegend(false))}
        >
          <div
            className="bg-background flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ratings-legend-title" className="text-lg font-bold">
              Échelle des niveaux
            </h2>
            <ul className="flex flex-col gap-1.5">
              {RATING_LEVELS.map((l) => (
                <li key={l.value} className="bg-muted/40 grid grid-cols-[44px_1fr] items-center gap-2.5 rounded-lg p-2 text-sm">
                  <span className="rounded-md py-1.5 text-center text-sm font-extrabold text-white" style={{ backgroundColor: l.color }}>
                    {l.value}
                  </span>
                  <span>
                    <strong className="block">{l.label}</strong>
                    <span className="text-muted-foreground">{l.description}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Button type="button" onClick={() => legendGuard.close(() => setShowLegend(false))}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      {/* Reopenable "why" explainer — same content as the mandatory intro's first bullet,
          but available at any time (not just on a coach's first visit) since a coach who
          dismissed the intro months ago, or a new coach joining later, has no other way to
          be reminded what this page is actually for. */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ratings-info-title"
          onClick={() => infoGuard.close(() => setShowInfo(false))}
        >
          <div
            className="bg-background flex w-full max-w-lg flex-col gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ratings-info-title" className="text-lg font-bold text-balance">
              À quoi sert cette note ?
            </h2>
            <div className="flex flex-col gap-2.5 text-sm leading-relaxed">
              <p>
                Elle sert de <strong>base</strong> pour calculer le niveau de chaque joueur, utilisé notamment pour{' '}
                <strong>équilibrer les équipes</strong> à l'entraînement.
              </p>
              <p>
                Elle compte surtout pour un joueur qui n'a <strong>pas encore beaucoup joué</strong> : au fil des matchs
                et des entraînements, ses vraies performances (notes des coéquipiers, résultats, assiduité) prennent
                progressivement le relais sur ta note.
              </p>
              <p>
                Note son <strong>niveau général de jeu</strong>, tel que tu le vois sur le terrain — pas ses statistiques,
                ni sa présence. Ta note reste <strong>privée</strong> : ni les joueurs ni les autres coachs ne la voient,
                seule la moyenne des coachs sert au calcul.
              </p>
            </div>
            <Button type="button" onClick={() => infoGuard.close(() => setShowInfo(false))} className="mt-1">
              Fermer
            </Button>
          </div>
        </div>
      )}

      {/* Recap confirmation before the all-or-nothing save. */}
      {showRecap && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ratings-recap-title">
          <div className="bg-background flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
            <h2 id="ratings-recap-title" className="text-lg font-bold text-balance">
              Vérifie tes notes avant d'enregistrer
            </h2>
            <p className="text-muted-foreground text-sm">
              {players.length} joueurs notés, du mieux noté au moins bien noté. Une fois confirmé, toutes tes notes sont
              enregistrées d'un coup.
            </p>
            <ul className="flex flex-col gap-1.5">
              {recapGroups.map((g) => (
                <li key={g.rating} className="bg-muted/40 grid grid-cols-[64px_1fr] items-start gap-2.5 rounded-lg p-2 text-sm">
                  <span className="rounded-md py-1.5 text-center text-sm leading-tight font-extrabold text-white" style={{ backgroundColor: ratingLevel(g.rating).color }}>
                    {formatRating(g.rating)}
                    <span className="block text-[10px] font-semibold">{ratingLevel(g.rating).label}</span>
                  </span>
                  <span className="pt-1.5">{g.names.join(', ')}</span>
                </li>
              ))}
            </ul>
            {saveMutation.isError && (
              <p role="alert" className="text-destructive text-sm">
                Impossible d'enregistrer tes notes. Réessaie.
              </p>
            )}
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <Button type="button" variant="outline" onClick={() => recapGuard.close(() => setShowRecap(false))}>
                Modifier
              </Button>
              <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Enregistrement…' : 'Confirmer et enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
        Seule la moyenne des coachs sert au calcul du niveau — personne ne voit ta note individuelle.
      </p>
    </div>
  )
}
