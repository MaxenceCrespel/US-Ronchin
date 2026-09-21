import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** Tells the person they're offline — the app shell still opens (see public/sw.js), but the
 * data on screen may be out of date and actions won't go through. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
  if (online) return null
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      Tu es hors ligne : les informations affichées peuvent ne pas être à jour et tes actions ne seront pas enregistrées.
    </div>
  )
}
