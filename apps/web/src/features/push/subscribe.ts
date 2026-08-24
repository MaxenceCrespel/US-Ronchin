import { fetchVapidPublicKey, subscribePush } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window

export type EnablePushResult = { ok: true } | { ok: false; error: string }

/** Shared by NotificationSettingsCard (Profile) and NotificationPrompt (post-install
 * nudge) so the permission/subscribe flow only lives in one place. */
export async function enablePushNotifications(): Promise<EnablePushResult> {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return {
        ok: false,
        error: 'Autorisation refusée — active les notifications dans les réglages du navigateur.',
      }
    }
    const registration = await navigator.serviceWorker.ready
    const publicKey = await fetchVapidPublicKey()
    if (!publicKey) {
      return { ok: false, error: "Les notifications ne sont pas configurées côté serveur pour l'instant." }
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
    await subscribePush(subscription.toJSON() as PushSubscriptionJSON)
    return { ok: true }
  } catch {
    return { ok: false, error: "Impossible d'activer les notifications." }
  }
}
