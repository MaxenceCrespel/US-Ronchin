import { ATTENDANCE_STATUS_LABELS } from '@/lib/labels'
import type { AttendanceStatusChangeEntry } from '@/lib/types'

/** One line of the coach's "Historique des réponses" — see AttendanceStatusChange on the API.
 *
 * The same status before and after, changed by someone OTHER than the player themselves, can
 * only mean one thing: another player declaring PRESENT into a full session took this row's
 * place (a confirmed guest first, since a guest ranks below every player — see
 * AttendancesService.evictGuest — otherwise a lower-priority player, see evictLowerPriority),
 * so it says who took it. A promotion off the waitlist is logged as the promoted player's own
 * doing (changedBy === userId), so it never lands in that branch. */
export function describeAttendanceChange(entry: AttendanceStatusChangeEntry): string {
  const from = entry.previousStatus ? ATTENDANCE_STATUS_LABELS[entry.previousStatus] : 'Aucune réponse'
  const to = ATTENDANCE_STATUS_LABELS[entry.newStatus]
  const isSelf = entry.changedBy === entry.userId
  const actor = isSelf ? null : `${entry.changer.firstName} ${entry.changer.lastName[0]}.`
  const notes: string[] = []
  if (entry.previousConfirmed !== entry.newConfirmed) {
    notes.push(entry.newConfirmed ? "passé de liste d'attente à confirmé" : "mis en liste d'attente")
  }
  const guestDiff = entry.newConfirmedGuestCount - entry.previousConfirmedGuestCount
  if (guestDiff > 0) {
    notes.push(`${guestDiff} invité${guestDiff > 1 ? 's' : ''} confirmé${guestDiff > 1 ? 's' : ''} en plus`)
  } else if (guestDiff < 0) {
    notes.push(`${-guestDiff} invité${-guestDiff > 1 ? 's' : ''} repassé${-guestDiff > 1 ? 's' : ''} en attente`)
  }
  const noteText = notes.length > 0 ? ` — ${notes.join(', ')}` : ''
  if (from === to && !isSelf && notes.length > 0) {
    return `Place prise par ${actor}${noteText}`
  }
  return `${from} → ${to}${noteText}${actor ? ` (par ${actor}, coach)` : ''}`
}
