import type { User } from './types'

const REQUIRED_PROFILE_FIELDS: (keyof User)[] = [
  'birthDate',
  'position',
  'preferredFoot',
  'phone',
  'heightCm',
  'weightKg',
]

export function isProfileComplete(user: User): boolean {
  return REQUIRED_PROFILE_FIELDS.every((field) => user[field] != null)
}
