import { subscribePush, unsubscribePush } from './api'
import { hasOptedOut, isPushSupported, rememberEndpoint, rememberedEndpoint, subscribeThisDevice } from './subscribe'

/** Brings the server's view of this device's notifications back in line with the phone:
 * - permission granted and subscribed → re-sent, so the server knows it's still live (and
 *   picks up a subscription the browser renewed on its own, see sw.js pushsubscriptionchange);
 * - permission granted but no subscription left (renewed or lost by the browser) →
 *   re-subscribed silently, no prompt needed since the player already said yes;
 * - permission revoked from the phone's settings (or notifications turned off from
 *   Profile) → the subscription this device last registered is removed server-side.
 * Without this the server only learnt about a dead subscription when a push to it failed,
 * so the admin dashboard kept showing notifications as on (or off) long after the fact. */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported() || typeof Notification === 'undefined') return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return
  const previous = rememberedEndpoint()
  const current = await registration.pushManager.getSubscription()

  if (Notification.permission !== 'granted' || hasOptedOut()) {
    if (current) await current.unsubscribe().catch(() => {})
    if (previous) {
      await unsubscribePush(previous)
      rememberEndpoint(null)
    }
    return
  }

  const subscription = current ?? (await subscribeThisDevice(registration))
  if (!subscription) return
  if (current) {
    await subscribePush(current.toJSON() as PushSubscriptionJSON)
    rememberEndpoint(current.endpoint)
  }
  if (previous && previous !== subscription.endpoint) {
    await unsubscribePush(previous).catch(() => {})
  }
}
