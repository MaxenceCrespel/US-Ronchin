import type { User } from './types'

const REQUIRED_SCALAR_FIELDS: (keyof User)[] = [
  'birthDate',
  'preferredFoot',
  'phone',
  'heightCm',
  'weightKg',
]

export function isProfileComplete(user: User): boolean {
  return REQUIRED_SCALAR_FIELDS.every((field) => user[field] != null) && user.positions.length > 0
}
