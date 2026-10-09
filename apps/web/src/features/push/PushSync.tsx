import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { syncPushSubscription } from './push-sync'

const MIN_INTERVAL_MS = 10 * 60_000
let lastSyncAt = 0

/** Mounted once in the app layout: syncs on launch and when the app comes back to the
 * foreground, at most every few minutes. */
export function PushSync() {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return
    const run = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastSyncAt < MIN_INTERVAL_MS) return
      lastSyncAt = Date.now()
      syncPushSubscription().catch(() => {})
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [user])

  return null
}
