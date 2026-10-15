import { ATTENDANCE_STATUS_LABELS } from '@/lib/labels'
import type { AttendanceStatusChangeEntry } from '@/lib/types'

/** One line of the coach's "Historique des réponses" — see AttendanceStatusChange on the API.
 * Always written as a continuation of "{Prénom Nom} " (see TrainingsPage's AttendanceHistoryDialog),
 * so every branch reads as something that happened TO that player, never "Place prise par X"
 * right after their own name — which used to read backwards (sounded like THEY took a place).
 *
 * The same status before and after, changed by someone OTHER than the player themselves, can
 * only mean one thing: another player declaring PRESENT into a full session took this row's
 * place (a confirmed guest first, since a guest ranks below every player — see
 * AttendancesService.evictGuest — otherwise a lower-priority player, see evictLowerPriority).
 * A promotion off the waitlist is logged as the promoted player's own doing (changedBy ===
 * userId), so it's told apart from an eviction by isSelf rather than by who did it. */
export function describeAttendanceChange(entry: AttendanceStatusChangeEntry): string {
  const from = entry.previousStatus ? ATTENDANCE_STATUS_LABELS[entry.previousStatus] : 'Aucune réponse'
  const to = ATTENDANCE_STATUS_LABELS[entry.newStatus]
  const isSelf = entry.changedBy === entry.userId
  const actor = isSelf ? null : `${entry.changer.firstName} ${entry.changer.lastName[0]}.`
  const statusChanged = entry.previousStatus !== entry.newStatus
  const confirmedChanged = entry.previousConfirmed !== entry.newConfirmed
  const guestDiff = entry.newConfirmedGuestCount - entry.previousConfirmedGuestCount
  const guestNote =
    guestDiff > 0
      ? `${guestDiff} invité${guestDiff > 1 ? 's' : ''} confirmé${guestDiff > 1 ? 's' : ''} en plus`
      : guestDiff < 0
        ? `${-guestDiff} invité${-guestDiff > 1 ? 's' : ''} repassé${-guestDiff > 1 ? 's' : ''} en attente`
        : null

  // The player (or the coach, for them) actually changed their declared status.
  if (statusChanged) {
    const suffix = actor ? ` (par ${actor}, coach)` : ''
    return `${from} → ${to}${guestNote ? ` — ${guestNote}` : ''}${suffix}`
  }

  // Status didn't move — only the confirmed slot shifted, as a side effect of someone else's
  // own arrival (evicted) or automatically once a slot freed up (promoted, isSelf).
  if (confirmedChanged) {
    return entry.newConfirmed
      ? "promu·e de la liste d'attente : confirmé·e"
      : `a perdu sa place (liste d'attente)${actor ? ` — remplacé·e par ${actor}` : ''}`
  }

  // Neither moved — only a guest's own slot did (bumped or restored by someone else's arrival).
  if (guestNote) {
    return `${guestNote}${actor ? ` — remplacé·e par ${actor}` : ''}`
  }

  return `${from} → ${to}`
}
