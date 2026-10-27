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

export type NotificationCategory =
  | 'ATTENDANCE_REMINDERS'
  | 'CONVOCATIONS'
  | 'MATCH_RESULTS'
  | 'TRAINING_TEAMS'
  | 'AWARDS'
  | 'BADGES'
  | 'BIRTHDAYS'
  | 'COACH'

export async function fetchMutedCategories(): Promise<NotificationCategory[]> {
  const { data } = await apiClient.get<{ mutedCategories: NotificationCategory[] }>('/push/preferences')
  return data.mutedCategories
}

export async function saveMutedCategories(mutedCategories: NotificationCategory[]): Promise<NotificationCategory[]> {
  const { data } = await apiClient.put<{ mutedCategories: NotificationCategory[] }>('/push/preferences', {
    mutedCategories,
  })
  return data.mutedCategories
}
