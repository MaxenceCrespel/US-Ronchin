import { apiClient } from '@/lib/api-client'
import type { PlayerSubPosition, PreferredFoot, User } from '@/lib/types'

export interface UpdateProfileInput {
  positions?: PlayerSubPosition[]
  jerseyNumber?: number
  preferredFoot?: PreferredFoot
  birthDate?: string
  hasSeenOnboarding?: boolean
}

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const { data } = await apiClient.patch<User>('/users/me', input)
  return data
}

export async function uploadAvatar(file: File): Promise<User> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<User>('/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteAvatar(): Promise<User> {
  const { data } = await apiClient.delete<User>('/users/me/avatar')
  return data
}
