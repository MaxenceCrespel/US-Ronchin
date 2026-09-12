import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Pencil, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useAuthStore } from '@/lib/auth-store'
import { useOnboardingUiStore } from '@/lib/onboarding-store'
import { isRosterPlayer } from '@/lib/roster'
import { cn } from '@/lib/utils'
import { monthLabelDisplay } from '@/lib/month-label'
import { fetchPlayers } from '@/features/players/api'
import type { AwardCategory } from '@/lib/types'
import { castVote, fetchAwardCategories, fetchMonthlyAward } from './api'
import { PlayerVoteGrid, type VotablePlayer } from './PlayerVoteGrid'

// Lazy for the same reason as everywhere else this shows up — three.js is heavy, kept out of
// the main bundle until a device actually has a vote (or a trophy) to show.
const CategoryTrophyScene = lazy(() =>
  import('./Trophy3D').then((m) => ({ default: m.CategoryTrophyScene })),
)

const POLL_INTERVAL_MS = 60_000

/** A one-liner per trophy so the vote feels like designating someone, not filling a form —
 * keyed off the category `key` (see api/awards/fixed-categories.ts and
 * monthly-award.constant.ts), with a neutral fallback if a new category ever shows up before
 * this map is updated. */
const CATEGORY_BLURB: Record<string, string> = {
  player_of_season: "Le joueur qui a porté l'équipe toute la saison.",
  worst_player: 'Sans rancune… quelqu’un doit bien finir dernier.',
  breakthrough: "La bonne surprise de l'année, celle qu'on n'attendait pas si haut.",
  best_teammate: 'Toujours là — au vestiaire, aux entraînements, dans les coups durs.',
  butcher: 'Le tacle qui laisse des traces. Le carton qui se sentait venir.',
  player_of_month: 'Le joueur qui a marqué ce mois-ci — sur le terrain ou dans le vestiaire.',
}

type Phase = 'intro' | 'vote' | 'review' | 'done'
type Source = 'season' | 'monthly'

interface Flow {
  source: Source
  periodLabel: string | null
  categories: AwardCategory[]
  players: VotablePlayer[]
}

/** Mounted once at the app root (same idea as BadgeUnlockWatcher) — while EITHER the season
 * awards vote or the month's vote is open and a roster player still has an unvoted category
 * in it, this takes over the whole screen, the same way /complete-profile blocks navigation
 * before that gate is cleared. A guided flow either way (one trophy at a time, tap a
 * player's face to pick them, review, confirm) rather than a stack of dropdowns — season
 * because it's a once-a-year moment worth the ceremony, monthly for consistency with it
 * (same mandatory treatment the user asked for, not a lesser one). Season always wins if
 * both happen to be open and unvoted at once — the rarer, bigger event, same convention as
 * ceremony-gate.ts's reveal priority — so the two can never stack; the monthly flow simply
 * doesn't start until the season one has nothing left pending. Disappears the instant every
 * category in whichever source is showing gets voted — AwardsService closes the whole
 * season/month early once the entire roster has too. */
export function MandatoryVotePopup() {
  const user = useAuthStore((s) => s.user)
  const tourActive = useOnboardingUiStore((s) => s.active)
  const queryClient = useQueryClient()

  // A non-playing coach/admin isn't part of the roster and isn't forced to vote — same rule
  // for both sources.
  const eligible = !!user && isRosterPlayer(user) && !tourActive

  const seasonQuery = useQuery({
    queryKey: ['award-categories'],
    queryFn: fetchAwardCategories,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const monthlyQuery = useQuery({
    queryKey: ['award-monthly'],
    queryFn: fetchMonthlyAward,
    enabled: eligible,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  const playersQuery = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
    enabled: eligible,
  })

  const seasonPending = useMemo(
    () => (seasonQuery.data ?? []).filter((c) => c.isActive && !c.myVoteUserId),
    [seasonQuery.data],
  )
  const monthlyPending = useMemo(
    () => (monthlyQuery.data?.current ?? []).filter((c) => c.isActive && !c.myVoteUserId),
    [monthlyQuery.data],
  )
  const source: Source | null = seasonPending.length > 0 ? 'season' : monthlyPending.length > 0 ? 'monthly' : null
  const pending = source === 'season' ? seasonPending : source === 'monthly' ? monthlyPending : []

  // Snapshot the source + categories + roster the first time everything's ready, and never
  // touch it again — the 60s poll / refocus refetch must not reshuffle the flow mid-vote.
  const [flow, setFlow] = useState<Flow | null>(null)
  useEffect(() => {
    if (flow || !eligible || !source || pending.length === 0 || !playersQuery.data) return
    setFlow({
      source,
      periodLabel:
        source === 'season' ? (pending[0]?.season ?? null) : pending[0]?.season ? monthLabelDisplay(pending[0].season) : null,
      categories: pending,
      players: playersQuery.data
        // No voting for yourself — you're not in your own grid.
        .filter((p) => isRosterPlayer(p) && p.id !== user!.id)
        .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, avatarUrl: p.avatarUrl })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, eligible, source, pending, playersQuery.data])

  // Once the flow's own source no longer has anything pending (its vote landed and the
  // query refetched), clear the snapshot so the effect above is free to pick a fresh one —
  // covers the season flow finishing while a monthly one is *also* waiting: without this,
  // `flow` would stay frozen on the completed season snapshot forever, since the effect
  // above only builds a new one while `flow` is still null. Never fires mid-vote purely from
  // the query's own 60s poll: the vote hasn't landed server-side yet, so `source` still
  // matches `flow.source` right up until the invalidate below actually lands.
  useEffect(() => {
    if (flow && source !== flow.source) setFlow(null)
  }, [flow, source])

  const [phase, setPhase] = useState<Phase>('intro')
  const [catIndex, setCatIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [selections, setSelections] = useState<Record<string, string>>({})
  // Set when the viewer opened a single category from the review screen — "Suivant" then
  // drops them straight back to the recap instead of walking the whole sequence again.
  const [editingFromReview, setEditingFromReview] = useState(false)

  // The stage is a scroll container (a long player grid can run past the fold on a phone) —
  // every category / phase change starts back at the top rather than keeping the previous
  // screen's scroll offset.
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 })
  }, [phase, catIndex])

  const voteMutation = useMutation({
    mutationFn: (votes: { categoryId: string; votedForId: string }[]) =>
      Promise.all(votes.map((v) => castVote(v.categoryId, v.votedForId))),
    onSuccess: () => setPhase('done'),
  })

  // Hold the "C'est voté" screen for a beat, then let the invalidated query flush `pending`
  // to empty — which unmounts this whole thing (or, if the other source still has an unvoted
  // category of its own, lets a fresh `flow` snapshot pick it up right after).
  useEffect(() => {
    if (phase !== 'done' || !flow) return
    const t = setTimeout(() => {
      setSelections({})
      queryClient.invalidateQueries({ queryKey: flow.source === 'season' ? ['award-categories'] : ['award-monthly'] })
    }, 2400)
    return () => clearTimeout(t)
  }, [phase, flow, queryClient])

  if (!eligible || pending.length === 0 || !flow) return null

  const { periodLabel, categories, players } = flow
  const category = categories[catIndex]
  const nameOf = (id: string) => {
    const p = players.find((x) => x.id === id)
    return p ? `${p.firstName} ${p.lastName}` : ''
  }

  function goToCategory(index: number, direction: number) {
    setDir(direction)
    setCatIndex(index)
    setPhase('vote')
  }

  function editCategory(index: number) {
    setEditingFromReview(true)
    goToCategory(index, -1)
  }

  function toReview(direction: number) {
    setEditingFromReview(false)
    setDir(direction)
    setPhase('review')
  }

  function next() {
    if (editingFromReview) {
      toReview(1)
    } else if (catIndex + 1 < categories.length) {
      goToCategory(catIndex + 1, 1)
    } else {
      toReview(1)
    }
  }

  function back() {
    if (editingFromReview) {
      toReview(-1)
    } else if (catIndex > 0) {
      goToCategory(catIndex - 1, -1)
    } else {
      setDir(-1)
      setPhase('intro')
    }
  }

  const slide = {
    initial: (d: number) => ({ opacity: 0, x: d * 40 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -40 }),
  }

  return (
    <div ref={stageRef} className="fixed inset-0 z-[9998] overflow-y-auto bg-black text-white">
      {/* Rich, on-brand backdrop — a lit stage feel without going full velvet gala. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(30,58,138,0.55) 0%, rgba(10,10,25,0.9) 55%, #05060d 100%)',
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-40"
        style={{ background: 'linear-gradient(to bottom, rgba(244,180,0,0.12), transparent)' }}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-8">
        {/* Header — trophy mark + period, always visible so the whole flow reads as one moment. */}
        <div className="flex flex-col items-center gap-1.5 pb-6 text-center">
          <span className="border-club-gold/40 bg-club-gold/10 flex size-11 items-center justify-center rounded-full border">
            <Trophy className="text-club-gold size-5" />
          </span>
          <p className="text-club-gold text-[11px] font-semibold tracking-[0.2em] uppercase">
            {flow.source === 'season'
              ? `Trophées ${periodLabel ? `· ${periodLabel}` : 'de la saison'}`
              : `Trophées du mois${periodLabel ? ` · ${periodLabel}` : ''}`}
          </p>
        </div>

        {/* Progress rail — one segment per trophy, filled as you go. */}
        {(phase === 'vote' || phase === 'review') && (
          <div className="mb-6 flex gap-1.5">
            {categories.map((c, i) => (
              <span
                key={c.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  selections[c.id]
                    ? 'bg-club-gold'
                    : phase === 'vote' && i === catIndex
                      ? 'bg-white/50'
                      : 'bg-white/12',
                )}
              />
            ))}
          </div>
        )}

        <div className="flex flex-1 flex-col">
          <AnimatePresence mode="wait" custom={dir}>
            {phase === 'intro' && (
              <motion.div
                key="intro"
                custom={dir}
                variants={slide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center"
              >
                <h2 className="text-3xl font-bold">À toi de voter</h2>
                <p className="max-w-xs text-white/70">
                  {categories.length} trophée{categories.length > 1 ? 's' : ''} à décerner. Choisis un
                  joueur pour chacun — les résultats sont dévoilés à la cérémonie, pas avant.
                </p>
                <Button
                  size="lg"
                  onClick={() => goToCategory(0, 1)}
                  className="bg-club-gold hover:bg-club-gold/90 mt-2 gap-2 text-black shadow-[0_0_24px_rgba(244,180,0,0.35)]"
                >
                  Commencer
                  <ArrowRight className="size-4" />
                </Button>
              </motion.div>
            )}

            {phase === 'vote' && category && (
              <motion.div
                key={`vote-${category.id}`}
                custom={dir}
                variants={slide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-1 flex-col gap-4"
              >
                <div className="text-center">
                  <p className="text-xs font-medium text-white/40">
                    {catIndex + 1} / {categories.length}
                  </p>
                  {/* The trophy itself, spinning — up until now the vote screen only ever
                      named the category in text; seeing the actual object being decided
                      makes the choice feel like it's for something real, not a form field. */}
                  <div className="mx-auto -mt-1 mb-1 h-32 w-32">
                    <Suspense fallback={null}>
                      <CategoryTrophyScene categoryKey={category.key} spinning className="size-full" />
                    </Suspense>
                  </div>
                  <h2 className="mt-1 text-2xl font-bold">{category.title}</h2>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-white/60">
                    {CATEGORY_BLURB[category.key] ?? 'À toi de désigner ton favori.'}
                  </p>
                </div>

                <PlayerVoteGrid
                  players={players}
                  selectedId={selections[category.id] ?? null}
                  onSelect={(id) => setSelections((s) => ({ ...s, [category.id]: id }))}
                />
              </motion.div>
            )}

            {phase === 'review' && (
              <motion.div
                key="review"
                custom={dir}
                variants={slide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-1 flex-col gap-4"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-bold">Tes votes</h2>
                  <p className="mt-1 text-sm text-white/60">Un dernier coup d'œil avant d'envoyer.</p>
                </div>

                <ul className="flex flex-col gap-2">
                  {categories.map((c, i) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                    >
                      <PlayerAvatar
                        avatarUrl={players.find((p) => p.id === selections[c.id])?.avatarUrl}
                        firstName={players.find((p) => p.id === selections[c.id])?.firstName}
                        lastName={players.find((p) => p.id === selections[c.id])?.lastName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-white/50">{c.title}</p>
                        <p className="truncate text-sm font-semibold">{nameOf(selections[c.id])}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => editCategory(i)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="size-3" />
                        Modifier
                      </button>
                    </li>
                  ))}
                </ul>

                {voteMutation.isError && (
                  <p className="text-sm text-red-400">Une erreur est survenue, réessaie.</p>
                )}
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center"
              >
                <span className="bg-club-gold flex size-16 items-center justify-center rounded-full text-black shadow-[0_0_32px_rgba(244,180,0,0.5)]">
                  <Check className="size-8" strokeWidth={3} />
                </span>
                <h2 className="text-2xl font-bold">C'est voté !</h2>
                <p className="max-w-xs text-white/70">
                  Merci. Rendez-vous à la cérémonie pour découvrir les gagnants.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer actions — pinned under the flowing content. */}
        {phase === 'vote' && category && (
          <div className="mt-6 flex items-center gap-3">
            <Button variant="ghost" onClick={back} className="gap-1.5 text-white/70 hover:text-white">
              <ArrowLeft className="size-4" />
              {editingFromReview ? 'Récap' : 'Retour'}
            </Button>
            <Button
              size="lg"
              disabled={!selections[category.id]}
              onClick={next}
              className="bg-club-gold hover:bg-club-gold/90 ml-auto gap-2 text-black shadow-[0_0_24px_rgba(244,180,0,0.35)] disabled:opacity-40"
            >
              {editingFromReview
                ? 'Enregistrer'
                : catIndex + 1 < categories.length
                  ? 'Suivant'
                  : 'Vérifier'}
              {!editingFromReview && <ArrowRight className="size-4" />}
            </Button>
          </div>
        )}

        {phase === 'review' && (
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => goToCategory(categories.length - 1, -1)}
              className="gap-1.5 text-white/70 hover:text-white"
            >
              <ArrowLeft className="size-4" />
              Retour
            </Button>
            <Button
              size="lg"
              disabled={voteMutation.isPending || categories.some((c) => !selections[c.id])}
              onClick={() =>
                voteMutation.mutate(
                  categories.map((c) => ({ categoryId: c.id, votedForId: selections[c.id] })),
                )
              }
              className="bg-club-gold hover:bg-club-gold/90 ml-auto gap-2 text-black shadow-[0_0_24px_rgba(244,180,0,0.35)] disabled:opacity-40"
            >
              {voteMutation.isPending ? 'Envoi…' : 'Valider mes votes'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
