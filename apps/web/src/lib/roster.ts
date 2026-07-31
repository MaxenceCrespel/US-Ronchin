import type { User } from './types'

/** True for regular players, and for a coach who also plays (player-manager/captain) —
 * use this instead of `role === 'PLAYER'` anywhere a list should include everyone
 * eligible to be on the pitch. */
export function isRosterPlayer(user: User): boolean {
  return user.role === 'PLAYER' || user.isPlayingCoach
}
