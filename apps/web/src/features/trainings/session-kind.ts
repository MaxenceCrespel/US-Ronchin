import { Dumbbell, Goal, type LucideIcon } from 'lucide-react'
import type { SessionKind } from '@/lib/types'

/** Everything that tells a Five apart from a regular training at a glance — label, icon and
 * colour — kept in one place so the calendar, the cards and the home screen never disagree.
 * Matches stay gold, trainings club blue, fives emerald. */
export const SESSION_KIND: Record<
  SessionKind,
  {
    /** "Entraînement" / "Five" — also starts sentences ("Five de ce soir annulé"). */
    label: string
    Icon: LucideIcon
    /** Round icon bubble on cards. */
    bubbleClass: string
    /** Calendar dot / chip on an unselected day. */
    dotClass: string
    chipClass: string
  }
> = {
  TRAINING: {
    label: 'Entraînement',
    Icon: Dumbbell,
    bubbleClass: 'bg-club-blue/10 text-club-blue',
    dotClass: 'bg-club-blue',
    chipClass: 'bg-club-blue/15 text-club-blue-dark hover:bg-club-blue/25',
  },
  FIVE: {
    label: 'Five',
    Icon: Goal,
    bubbleClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
    chipClass: 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300',
  },
}

/** Older API responses (before the kind existed) have no `kind` — they're all trainings. */
export function sessionKindOf(session: { kind?: SessionKind | null }): SessionKind {
  return session.kind ?? 'TRAINING'
}
