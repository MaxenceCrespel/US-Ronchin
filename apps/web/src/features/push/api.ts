import { apiClient } from '@/lib/api-client'

export async function fetchVapidPublicKey(): Promise<string> {
  const { data } = await apiClient.get<{ publicKey: string }>('/push/vapid-public-key')
  return data.publicKey
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await apiClient.post('/push/subscribe', subscription)
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiClient.delete('/push/subscribe', { data: { endpoint } })
}
