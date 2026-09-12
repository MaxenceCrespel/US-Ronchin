import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, X } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { monthLabelDisplay } from '@/lib/month-label'
import { getSeasonBounds, isInSeason, isMonthInSeason } from '@/lib/season'
import { fetchMyMatchTrophies } from '@/features/matches/api'
import { fetchAvailableSeasons, fetchMyAttendanceTrophies, fetchMyTrainingChampionTrophies } from '@/features/stats/api'
import { fetchAwardCategories, fetchMonthlyAward } from './api'
import { useTrophySnapshot } from './TrophySnapshot'

// Lazy for the same reason as in MonthlyTrophyReveal — three.js is heavy, and nothing else
// in the app needs it, so it only loads once a device actually opens its trophy case.
const CategoryTrophyScene = lazy(() =>
  import('./Trophy3D').then((m) => ({ default: m.CategoryTrophyScene })),
)

/** One trophy this player has actually won — match, month, season, or a stat-based monthly
 * ranking, all collapsed to the same shape so a shelf never has to know which system a given
 * win came from. `period`, when set, is engraved directly onto the trophy itself (see
 * Trophy3D's Plaque) — only season and monthly wins carry one; a match trophy's date/score
 * lives in `detail` instead, read only when the trophy is opened big (see TrophyModal), not
 * engraved on the object. `metric` is a pre-formatted display string ("4 votes", "12
 * présences", "18 points") — what actually earned the win differs by category (a vote count
 * for the voted ones, a raw stat for the auto-computed ones), so the label is built once at
 * the source instead of every render site guessing which unit applies. */
interface WonTrophy {
  id: string
  categoryKey: string
  label: string
  metric: string
  period?: string
  detail: string
  /** "2026-09" — only present on monthly wins, used to filter/sort by season before display;
   * stripped off before a trophy actually reaches a shelf (see monthlyWon below). */
  month?: string
}

// Always at least this many shelf slots, filled or not — a single trophy sitting alone in an
// otherwise-empty light page read as a layout bug, not a showcase. Empty slots (dashed
// outline, "à gagner…") make the emptiness look intentional — a case waiting to be filled.
const MIN_SLOTS = 3
const SLOT_WIDTH = 'w-24 sm:w-28'

// How many trophies fit on one physical shelf level before a new one starts underneath —
// a real cabinet, not a single row that scrolls off past the edge of the screen.
const ROW_SIZE = 3

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

function formatMatchDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A corner cobweb — the sight gag for a vitrine nobody's won a single trophy in yet.
 * Fanned spokes from the corner plus a few connecting strands, low-opacity white so it reads
 * as dusty gauze against the dark cabinet interior rather than a bold decoration. */
function Cobweb({ corner }: { corner: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`pointer-events-none absolute top-0 h-14 w-14 opacity-25 sm:h-16 sm:w-16 ${
        corner === 'left' ? 'left-0' : 'right-0 -scale-x-100'
      }`}
      fill="none"
      stroke="white"
      strokeWidth="1"
      strokeLinecap="round"
    >
      <path d="M0 0 L64 0" strokeOpacity="0.5" />
      <path d="M0 0 L0 64" strokeOpacity="0.5" />
      <path d="M0 0 L64 22" />
      <path d="M0 0 L64 42" />
      <path d="M0 0 L42 64" />
      <path d="M0 0 L22 64" />
      <path d="M0 0 L64 64" />
      <path d="M7 0 Q7 7 0 7" />
      <path d="M16 0 Q16 16 0 16" />
      <path d="M27 0 Q27 27 0 27" />
      <path d="M40 0 Q40 40 0 40" />
      <path d="M54 0 Q54 54 0 54" />
      <path d="M64 10 Q32 10 10 32 Q10 64 10 64" />
      <path d="M64 26 Q47 26 26 47 Q26 64 26 64" />
      <path d="M64 46 Q56 46 46 56 Q46 64 46 64" />
    </svg>
  )
}

/** One warm museum-style spotlight, angled down onto the shelf below it — a small glowing
 * fixture plus a soft cone of light, not just a blurred halo behind the object it's lighting. */
function Spotlight() {
  return (
    <div className="relative flex h-16 w-full items-start justify-center">
      <span
        className="mt-1 h-1.5 w-7 rounded-full bg-[#ffdca0]"
        style={{ boxShadow: '0 0 14px 5px rgba(255,214,150,0.7)' }}
      />
      <span
        className="absolute top-2 h-14 w-20"
        style={{
          background: 'linear-gradient(180deg, rgba(255,214,150,0.22), transparent 85%)',
          clipPath: 'polygon(42% 0%, 58% 0%, 100% 100%, 0% 100%)',
        }}
      />
    </div>
  )
}

/** A shelf trophy's still image — see TrophySnapshot.tsx for why the shelf uses cached PNGs
 * instead of a live spinning Canvas per slot (too many simultaneous distinct 3D models would
 * exceed the browser's WebGL context budget and silently go blank). Shows the same pulsing
 * trophy placeholder while its snapshot is still queued/generating. */
function ShelfTrophyImage({ categoryKey, period }: { categoryKey: string; period?: string }) {
  const dataUrl = useTrophySnapshot(categoryKey, period)
  if (!dataUrl) {
    return (
      <div className="flex h-full w-full items-end justify-center pb-2">
        <Trophy className="size-9 animate-pulse text-[#f4b400]/40" />
      </div>
    )
  }
  return <img src={dataUrl} alt="" className="size-full object-contain" />
}

/** Just the object standing on the shelf — canvas plus its contact shadow, nothing else, and
 * always the same fixed height as its neighbours (filled or empty) so every base lines up
 * flush with the shelf plank directly underneath, regardless of how long any label ends up
 * being. The label lives in its own row below the plank instead — see ShelfLabel. Static and
 * facing forward on the shelf — spinning is reserved for the moment a trophy is actually
 * revealed (the ceremony) or opened big (see TrophyModal), not for idle browsing. Clickable
 * when it actually holds a trophy — opens it big. */
function ShelfObject({ trophy, onOpen }: { trophy: WonTrophy | null; onOpen?: () => void }) {
  return (
    <div className={`flex flex-col items-center ${SLOT_WIDTH}`}>
      {trophy === null ? (
        <div className="flex h-24 w-full items-end justify-center pb-2 opacity-35 sm:h-28">
          <Trophy className="size-9 text-white/25" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Voir le trophée en grand"
          className="h-24 w-full cursor-zoom-in transition-transform hover:scale-105 sm:h-28"
        >
          <ShelfTrophyImage categoryKey={trophy.categoryKey} period={trophy.period} />
        </button>
      )}
      {/* Contact shadow — where the base actually meets the shelf, the thing a floating blur
          glow behind the object could never sell. */}
      <span className={`-mt-1 h-2 w-14 rounded-full blur-[3px] ${trophy === null ? 'bg-black/25' : 'bg-black/55'}`} />
    </div>
  )
}

/** The trophy, seen big and spinning — the same 3D model, just on a much larger canvas, for
 * the moment someone actually wants to look at the thing rather than glance at a shelf full
 * of them. Also where a match trophy's date/score/opponent live, since they aren't engraved
 * on the object itself. */
function TrophyModal({ trophy, onClose }: { trophy: WonTrophy; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-4 bg-black/90 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white"
      >
        <X className="size-4" />
      </button>
      <div className="h-80 w-full max-w-sm sm:h-96" onClick={(e) => e.stopPropagation()}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Trophy className="size-16 animate-pulse text-[#f4b400]/40" />
            </div>
          }
        >
          <CategoryTrophyScene
            categoryKey={trophy.categoryKey}
            spinning
            period={trophy.period}
            className="size-full"
          />
        </Suspense>
      </div>
      <p className="text-lg font-semibold text-white capitalize">{trophy.label}</p>
      <p className="text-sm text-white/60">{trophy.detail}</p>
      <p className="text-sm text-[#f4b400]">{trophy.metric}</p>
    </div>
  )
}

function ShelfLabel({ trophy }: { trophy: WonTrophy | null }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${SLOT_WIDTH}`}>
      {trophy ? (
        <>
          <p className="text-center text-xs font-semibold text-white capitalize">{trophy.label}</p>
          <p className="text-center text-[10px] text-[#f4b400]">{trophy.metric}</p>
        </>
      ) : (
        <p className="text-center text-xs text-white/40">À gagner…</p>
      )}
    </div>
  )
}

/** One whole wooden display case — the thing TrophyCasePage shows three of (matches, month,
 * season). Everything from the wooden frame down is the same regardless of which set of wins
 * it's showing; only the title/subtitle and the trophies themselves differ between them. */
function TrophyShelf({
  title,
  subtitle,
  won,
  onOpen,
  tourId,
}: {
  title: string
  subtitle: string
  won: WonTrophy[]
  onOpen: (trophy: WonTrophy) => void
  /** Anchor for TrophyFeatureTour's one-time walkthrough — a separate attribute from the
   * main onboarding tour's own `data-tour`, see that component's doc comment for why. */
  tourId?: string
}) {
  // Rounded up to a full ROW_SIZE — every shelf level always carries exactly ROW_SIZE
  // spotlights/slots, even its last one, so a level short on real trophies still gets its
  // full run of lights rather than looking like a light burned out over an empty stretch.
  const slotCount = Math.ceil(Math.max(won.length, MIN_SLOTS) / ROW_SIZE) * ROW_SIZE
  const slots: (WonTrophy | null)[] = Array.from({ length: slotCount }, (_, i) => won[i] ?? null)
  const rows = chunk(slots, ROW_SIZE)

  return (
    <div className="flex flex-col gap-2" data-trophy-tour={tourId}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>

      {/* The wooden cabinet frame — a thick warm-brown border around the dark, glassed-in
          interior, the same way a real display case has a wooden case around its glass. */}
      <div className="rounded-2xl bg-gradient-to-b from-[#6b4423] via-[#4a2f18] to-[#2a1a0d] p-3 shadow-2xl sm:p-4">
        <div
          className="relative overflow-hidden rounded-lg"
          style={{
            background: 'radial-gradient(ellipse 120% 70% at 50% -10%, #132a40 0%, #071019 55%, #000 100%)',
          }}
        >
          {/* Glass-pane dividers, like sliding cabinet doors — faint vertical seams plus a
              couple of soft diagonal reflections; not literal glass (a lot of rendering for
              very little payoff) but enough to read as glazed. */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/10" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/10" />
            {/* Nobody's dusted this one off yet — a vitrine with zero wins gets cobwebs in
                both top corners instead of just sitting there looking broken. */}
            {won.length === 0 && (
              <>
                <Cobweb corner="left" />
                <Cobweb corner="right" />
              </>
            )}
            <div className="absolute -left-1/4 top-0 h-full w-1/4 -skew-x-12 bg-white/[0.04]" />
            <div className="absolute left-1/2 top-0 h-full w-1/5 -skew-x-12 bg-white/[0.03]" />
          </div>

          {/* One block per physical shelf level (up to ROW_SIZE trophies each), stacked
              vertically — a real cabinet with several shelves, not one row scrolling off
              past the edge of the screen. Each level owns its own spotlights/trophies/
              plank/labels as a single fixed-length group, so nothing has to independently
              wrap and re-align across rows — the four strips inside one level are always
              exactly the same length by construction. */}
          <div className="flex flex-col px-4 pt-2 sm:px-8">
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex flex-col">
                {/* Track lighting along the top of this shelf level */}
                <div className="flex justify-center">
                  {row.map((_, i) => (
                    <div key={i} className={SLOT_WIDTH}>
                      <Spotlight />
                    </div>
                  ))}
                </div>

                {/* The trophies, all bottom-aligned in fixed-height columns so every base
                    sits flush with the plank right below, whatever the label underneath
                    ends up saying. */}
                <div className="flex items-end justify-center">
                  {row.map((trophy, i) => (
                    <ShelfObject
                      key={trophy?.id ?? `empty-${rowIndex}-${i}`}
                      trophy={trophy}
                      onOpen={trophy ? () => onOpen(trophy) : undefined}
                    />
                  ))}
                </div>

                {/* The wooden shelf plank itself, running under this level's row of
                    trophies — this is what actually sells "standing on a shelf" rather
                    than "floating in a dark box". */}
                <div
                  className="relative h-3.5 bg-gradient-to-b from-[#8a5a2e] to-[#5c3a1a]"
                  style={{ boxShadow: '0 10px 16px -6px rgba(0,0,0,0.75)' }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
                </div>

                {/* Labels, in their own row below the plank — deliberately separate from
                    the trophies row above so a long label never nudges a trophy's base
                    out of alignment with its neighbours. */}
                <div className="relative flex justify-center pt-3 pb-5">
                  {row.map((trophy, i) => (
                    <ShelfLabel key={trophy?.id ?? `empty-label-${rowIndex}-${i}`} trophy={trophy} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Your own trophy case — and *only* yours: this always reads off the current session's
 * user, never a route param, so there's no URL that shows anyone else's trophies. A real 3D
 * model per trophy (see Trophy3D.tsx), standing on a lit wooden shelf inside a dark cabinet
 * with glass-panel dividers — the reference point is an actual trophy cabinet (warm
 * downlights, wood shelf, trophies grounded with real contact shadows), not a card grid with
 * a glow effect. Three separate cases, one per voting rhythm — a match's "Homme du match" /
 * "Patron de la défense" win, a month's "Joueur du mois", and the season's awards —
 * since each reads as a different frequency of recognition and would blur together on one
 * shelf. Season and month trophies carry their period engraved on the object itself (see
 * Trophy3D's Plaque); a match trophy's date/score only shows once opened (see TrophyModal).
 * The match and month shelves only ever show the *current* season's wins — they reset every
 * season (older ones stay archived in the database, just no longer surfaced by default,
 * see lib/season.ts) — while the season shelf keeps every season's wins forever. */
export function TrophyCasePage() {
  const user = useAuthStore((s) => s.user)
  const monthlyQuery = useQuery({ queryKey: ['award-monthly'], queryFn: fetchMonthlyAward })
  const seasonQuery = useQuery({ queryKey: ['award-categories'], queryFn: fetchAwardCategories })
  const matchTrophiesQuery = useQuery({ queryKey: ['my-match-trophies'], queryFn: fetchMyMatchTrophies })
  const attendanceTrophiesQuery = useQuery({
    queryKey: ['my-attendance-trophies'],
    queryFn: fetchMyAttendanceTrophies,
  })
  const trainingChampionTrophiesQuery = useQuery({
    queryKey: ['my-training-champion-trophies'],
    queryFn: fetchMyTrainingChampionTrophies,
  })
  const seasonsQuery = useQuery({ queryKey: ['available-seasons'], queryFn: fetchAvailableSeasons })
  const [openTrophy, setOpenTrophy] = useState<WonTrophy | null>(null)

  const isLoading =
    monthlyQuery.isLoading ||
    seasonQuery.isLoading ||
    matchTrophiesQuery.isLoading ||
    attendanceTrophiesQuery.isLoading ||
    trainingChampionTrophiesQuery.isLoading ||
    seasonsQuery.isLoading

  // Match and monthly trophies reset every season — only the *current* season's wins show
  // here (older ones stay archived in the database, just not surfaced in this default view);
  // the season vitrine below is the one exception, showing every season ever. See
  // lib/season.ts. Nothing shows for either shelf until the current season is actually known.
  const currentSeason = seasonsQuery.data?.current

  const seasonWon: WonTrophy[] = (seasonQuery.data ?? [])
    .filter((c) => !c.isActive && c.results?.[0]?.userId === user?.id)
    .map((c) => ({
      id: c.id,
      categoryKey: c.key,
      label: c.title,
      metric: `${c.results![0].votes} vote${c.results![0].votes > 1 ? 's' : ''}`,
      period: c.season ?? undefined,
      detail: c.season ? `Saison ${c.season}` : '',
    }))

  // "Joueur du mois" (voted) plus the two auto-computed stat trophies (no vote behind them,
  // just whoever the numbers say — see stats.service.ts) all share this one shelf: they're
  // all monthly, just with different sources feeding the same WonTrophy shape. `month` is
  // required here (unlike on WonTrophy itself) so the season filter/sort below can rely on it
  // before it gets stripped off ahead of display.
  const votedMonthlyWon: (WonTrophy & { month: string })[] = (monthlyQuery.data?.history ?? [])
    .filter((c) => c.results && c.results[0]?.userId === user?.id)
    .map((c) => ({
      id: c.id,
      categoryKey: c.key,
      label: c.title,
      metric: `${c.results![0].votes} vote${c.results![0].votes > 1 ? 's' : ''}`,
      period: monthLabelDisplay(c.season!).toUpperCase(),
      detail: capitalize(monthLabelDisplay(c.season!)),
      month: c.season!,
    }))

  const attendanceWon = (attendanceTrophiesQuery.data ?? []).map((t) => ({
    id: `attendance-${t.month}`,
    categoryKey: 'attendance_month',
    label: 'Assidu du mois',
    metric: `${t.value} présence${t.value > 1 ? 's' : ''}`,
    period: monthLabelDisplay(t.month).toUpperCase(),
    detail: capitalize(monthLabelDisplay(t.month)),
    month: t.month,
  }))

  const trainingChampionWon = (trainingChampionTrophiesQuery.data ?? []).map((t) => ({
    id: `training-champion-${t.month}`,
    categoryKey: 'training_champion_month',
    label: "Vainqueur d'entraînement",
    metric: `${t.value} point${t.value > 1 ? 's' : ''}`,
    period: monthLabelDisplay(t.month).toUpperCase(),
    detail: capitalize(monthLabelDisplay(t.month)),
    month: t.month,
  }))

  const monthlyWon: WonTrophy[] = ([...votedMonthlyWon, ...attendanceWon, ...trainingChampionWon] as (WonTrophy & {
    month: string
  })[])
    .filter((t) => !!currentSeason && isMonthInSeason(t.month, currentSeason))
    // oldest first, grouped by category — the shelf reads as a timeline within each
    // category rather than interleaving three different trophies month by month.
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.categoryKey.localeCompare(b.categoryKey)))
    .map(({ month: _month, ...trophy }) => trophy)

  const matchWon: WonTrophy[] = (matchTrophiesQuery.data ?? [])
    .filter((t) => !!currentSeason && isInSeason(t.date, getSeasonBounds(currentSeason)))
    .map((t) => ({
      id: `${t.matchId}-${t.kind}`,
      categoryKey: t.kind,
      label: t.kind === 'motm' ? 'Homme du match' : 'Patron de la défense',
      metric: `${t.votes} vote${t.votes > 1 ? 's' : ''}`,
      detail: `${t.homeAway === 'HOME' ? 'US Ronchin' : t.opponent} ${t.scoreHome ?? '-'} - ${t.scoreAway ?? '-'} ${t.homeAway === 'HOME' ? t.opponent : 'US Ronchin'} · ${formatMatchDate(t.date)}`,
    }))

  return (
    <div className="flex flex-col gap-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Trophy className="text-club-gold size-6" />
        Mes vitrines de trophées
      </h1>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : (
        <>
          <TrophyShelf
            title="Vitrine des matchs"
            subtitle='"Homme du match" et "Patron de la défense", votés après chaque match.'
            won={matchWon}
            onOpen={setOpenTrophy}
            tourId="matches"
          />
          <TrophyShelf
            title="Vitrine du mois"
            subtitle={`"Joueur du mois", "Assidu du mois" et "Vainqueur d'entraînement".`}
            won={monthlyWon}
            onOpen={setOpenTrophy}
            tourId="month"
          />
          <TrophyShelf
            title="Vitrine de la saison"
            subtitle="Les récompenses votées par l'équipe en fin de saison."
            won={seasonWon}
            tourId="season"
            onOpen={setOpenTrophy}
          />
        </>
      )}
      {openTrophy && <TrophyModal trophy={openTrophy} onClose={() => setOpenTrophy(null)} />}
    </div>
  )
}
