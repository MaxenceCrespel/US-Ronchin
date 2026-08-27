import { apiClient } from '@/lib/api-client'

export async function fetchVapidPublicKey(): Promise<string | null> {
  const { data } = await apiClient.get<{ publicKey: string | null }>('/push/vapid-public-key')
  return data.publicKey
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await apiClient.post('/push/subscribe', subscription)
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiClient.delete('/push/subscribe', { data: { endpoint } })
}

/** Coach-only — user ids with at least one active push subscription. */
export async function fetchSubscribedUserIds(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/push/subscribed-users')
  return data
}
