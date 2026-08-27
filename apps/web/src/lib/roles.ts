import type { User } from './types'

/** SUPERADMIN is a superset of COACH everywhere in the app — use this instead of a
 * direct `role === 'COACH'` check so a superadmin account gets full coach access. */
export function hasCoachAccess(user: User | null | undefined): boolean {
  return user?.role === 'COACH' || user?.role === 'SUPERADMIN'
}

/** Strictly SUPERADMIN — unlike hasCoachAccess, a plain COACH does NOT pass this. Use for
 * the handful of things reserved for the admin specifically (who's got notifications on,
 * viewing another player's badge grid), not the wider coach toolset. */
export function hasAdminAccess(user: User | null | undefined): boolean {
  return user?.role === 'SUPERADMIN'
}
