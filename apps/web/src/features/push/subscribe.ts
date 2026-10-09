import { fetchVapidPublicKey, subscribePush } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window

export type EnablePushResult = { ok: true } | { ok: false; error: string }

const ENDPOINT_KEY = 'push-endpoint'

/** The subscription this device last registered with the server — kept so a permission
 * revoked from the phone's settings (no browser event fires for that) can still be
 * unregistered server-side on the next launch. */
export function rememberedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY)
  } catch {
    return null
  }
}

export function rememberEndpoint(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint)
    else localStorage.removeItem(ENDPOINT_KEY)
  } catch {
    // non-critical — at worst a revoked permission is only cleaned up by the next failed push
  }
}

const OPTED_OUT_KEY = 'push-opted-out'

/** Set when the player turns notifications off from Profile — the phone's permission stays
 * granted then, so without this the launch sync would silently subscribe them again. */
export function hasOptedOut(): boolean {
  try {
    return localStorage.getItem(OPTED_OUT_KEY) === '1'
  } catch {
    return false
  }
}

export function setOptedOut(optedOut: boolean) {
  try {
    if (optedOut) localStorage.setItem(OPTED_OUT_KEY, '1')
    else localStorage.removeItem(OPTED_OUT_KEY)
  } catch {
    // non-critical
  }
}

/** Subscribes this device (permission must already be granted) and registers it. */
export async function subscribeThisDevice(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) return null
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })
  await subscribePush(subscription.toJSON() as PushSubscriptionJSON)
  rememberEndpoint(subscription.endpoint)
  return subscription
}

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
    setOptedOut(false)
    const registration = await navigator.serviceWorker.ready
    const subscription = await subscribeThisDevice(registration)
    if (!subscription) {
      return { ok: false, error: "Les notifications ne sont pas configurées côté serveur pour l'instant." }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Impossible d'activer les notifications." }
  }
}
