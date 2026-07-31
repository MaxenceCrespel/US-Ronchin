import { apiClient } from '@/lib/api-client'
import type { User, UserRole } from '@/lib/types'

export async function fetchPlayers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>('/users')
  return data
}

export interface AdminUpdateUserInput {
  role?: UserRole
  isPlayingCoach?: boolean
  isLicensed?: boolean
  licenseNumber?: string
}

export async function adminUpdateUser(
  userId: string,
  input: AdminUpdateUserInput,
): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${userId}`, input)
  return data
}

export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}`)
}
