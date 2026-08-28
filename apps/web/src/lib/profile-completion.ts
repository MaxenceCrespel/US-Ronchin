import type { User } from './types'

const REQUIRED_SCALAR_FIELDS: (keyof User)[] = ['birthDate', 'preferredFoot']

export function isProfileComplete(user: User): boolean {
  return (
    REQUIRED_SCALAR_FIELDS.every((field) => user[field] != null) &&
    (user.positions?.length ?? 0) > 0
  )
}

/** Retroactive correction for accounts that picked more positions than the current
 * @ArrayMaxSize(3) cap allows (some players had selected every single one, which broke
 * team-balancing's band-coverage logic — see UpdateProfileDto.positions). No stored flag
 * needed: this is just "does their current data still violate the cap", so it stops firing
 * the moment they fix it and never applies to anyone who was always within the limit. */
export function needsPositionsFix(user: User): boolean {
  return (user.positions?.length ?? 0) > 3
}
