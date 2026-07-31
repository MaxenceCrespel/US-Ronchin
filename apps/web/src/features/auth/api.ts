import { apiClient } from '@/lib/api-client'
import type { User } from '@/lib/types'

interface TokenPair {
  accessToken: string
  refreshToken: string
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/login', { email, password })
  return data
}

export async function acceptInvitation(token: string, password: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/accept-invitation', {
    token,
    password,
  })
  return data
}

export interface JoinInput {
  token: string
  email: string
  firstName: string
  lastName: string
  isLicensed: boolean
  password: string
}

export async function join(input: JoinInput): Promise<void> {
  await apiClient.post('/auth/join', input)
}

export async function approveUser(userId: string): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${userId}/approve`)
  return data
}

export async function fetchMe(): Promise<User> {
  const { data } = await apiClient.get<User>('/users/me')
  return data
}

export interface CreateInvitationInput {
  email: string
  firstName: string
  lastName: string
  isLicensed: boolean
}

export async function createInvitation(input: CreateInvitationInput) {
  const { data } = await apiClient.post<{ user: User; invitationUrl: string }>(
    '/auth/invitations',
    input,
  )
  return data
}
