import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayerRatingsReminderDismissedStore } from '@/lib/player-ratings-reminder-dismissed'
import { usePendingPlayerRatings } from './usePendingPlayerRatings'
import { Button } from '@/components/ui/button'

/** Mounted once at the app root, coach/admin only (same idea as MandatoryVotePopup /
 * VoteReminderBanner, which this deliberately mirrors) — while the signed-in coach still has
 * at least one player left to rate, a modal greets them at the start of the session; "Faire
 * plus tard" closes it for the rest of THIS session only (see the dismissed store's own
 * comment) and hands off to a small non-dismissible banner underneath, so the reminder never
 * fully disappears while the work is still genuinely pending — it just stops interrupting. */
export function PlayerRatingsReminder() {
  const navigate = useNavigate()
  const location = useLocation()
  const { enabled, missing, total } = usePendingPlayerRatings()
  const dismissed = usePlayerRatingsReminderDismissedStore((s) => s.dismissed)
  const dismiss = usePlayerRatingsReminderDismissedStore((s) => s.dismiss)

  if (!enabled || missing.length === 0 || location.pathname === '/player-ratings') return null

  const goRate = () => {
    dismiss()
    navigate('/player-ratings')
  }

  if (dismissed) {
    return (
      <div className="bg-amber-50 flex items-center gap-2.5 border-b border-amber-300/70 px-4 py-2.5 text-sm">
        <span className="flex-1 text-amber-900">
          <strong className="text-amber-950">Il reste {missing.length} joueur{missing.length > 1 ? 's' : ''} à noter</strong>
          {missing.length <= 2 ? ` — ${missing.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ')}` : ''}
        </span>
        <Button type="button" size="sm" onClick={goRate} className="shrink-0">
          Noter
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ratings-reminder-title">
      <div className="bg-background flex w-full max-w-md flex-col gap-3 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <h2 id="ratings-reminder-title" className="text-lg font-bold text-balance">
          Il reste {missing.length} joueur{missing.length > 1 ? 's' : ''} à noter
        </h2>
        <p className="text-muted-foreground text-sm">
          Tu en as déjà noté {total - missing.length} sur {total}, ton brouillon est conservé sur cet appareil. Ça prend
          quelques minutes pour finir.
        </p>
        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            className="h-full bg-club-blue"
            style={{ width: `${((total - missing.length) / Math.max(total, 1)) * 100}%` }}
            role="img"
            aria-label={`${total - missing.length} joueurs notés sur ${total}`}
          />
        </div>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Button type="button" variant="outline" onClick={dismiss}>
            Faire plus tard
          </Button>
          <Button type="button" onClick={goRate}>
            {total - missing.length > 0 ? 'Reprendre la notation' : 'Noter maintenant'}
          </Button>
        </div>
      </div>
    </div>
  )
}
