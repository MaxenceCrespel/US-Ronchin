import { Trophy } from 'lucide-react'
import { useVotePopupDismissedStore } from '@/lib/vote-popup-dismissed'
import { usePendingVote } from './usePendingVote'

/** Sits in the same slot as InstallAppBanner (below the header, above the page) — takes over
 * the instant MandatoryVotePopup is closed without voting, since that popup is itself
 * dismissible now (the vote window is genuinely open for a week or two, not something to
 * trap someone in on page load). Unlike that popup, this has no close button: the reminder
 * should stay put for as long as the vote genuinely is pending, and it disappears on its own
 * the moment the vote's cast or the window closes — never lingers past either. Tapping
 * "Voter" just reopens the exact same popup via the store they both share. */
export function VoteReminderBanner() {
  const { eligible, source, pending, periodLabel } = usePendingVote()
  const dismissed = useVotePopupDismissedStore((s) => s.dismissed)
  const reopen = useVotePopupDismissedStore((s) => s.reopen)

  if (!eligible || !source || pending.length === 0 || !dismissed) return null

  const title = source === 'season' ? 'Trophées de la saison' : `Trophées du mois${periodLabel ? ` de ${periodLabel}` : ''}`
  const detail =
    source === 'season'
      ? `${pending.length} vote${pending.length > 1 ? 's' : ''} en attente.`
      : "tu n'as pas voté."

  return (
    <div className="relative flex items-center gap-2.5 overflow-hidden border-b border-amber-300/70 bg-gradient-to-b from-amber-50 via-amber-100 to-amber-200/80 px-4 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="animate-banner-sheen pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <span className="animate-legendary-pulse relative flex size-7 shrink-0 items-center justify-center rounded-full bg-club-gold text-white">
        <Trophy className="size-3.5" />
      </span>
      <span className="relative min-w-0 flex-1 text-amber-900">
        <strong className="font-extrabold text-amber-950">{title}</strong> — {detail}
      </span>
      <button
        type="button"
        onClick={reopen}
        className="bg-club-gold hover:bg-club-gold/90 relative shrink-0 rounded-md px-3 py-1.5 text-xs font-extrabold text-amber-950 shadow-[0_3px_8px_-2px_rgba(180,130,0,0.45)]"
      >
        Voter
      </button>
    </div>
  )
}
