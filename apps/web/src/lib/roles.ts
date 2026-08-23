import type { User } from './types'

/** SUPERADMIN is a superset of COACH everywhere in the app — use this instead of a
 * direct `role === 'COACH'` check so a superadmin account gets full coach access. */
export function hasCoachAccess(user: User | null | undefined): boolean {
  return user?.role === 'COACH' || user?.role === 'SUPERADMIN'
}
