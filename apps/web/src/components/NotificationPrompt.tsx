import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'
import { isStandalone } from '@/lib/pwa'
import { enablePushNotifications, isPushSupported } from '@/features/push/subscribe'

const DISMISSED_KEY = 'notification-prompt-dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // non-critical — worst case the prompt reappears next session
  }
}

/** Nudges the player to enable push notifications right after they've installed the
 * app (running standalone) instead of only offering it buried in Profile settings —
 * only makes sense once installed, since iOS never supports push from a plain Safari tab. */
export function NotificationPrompt() {
  const user = useAuthStore((s) => s.user)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !isPushSupported() || !isStandalone() || wasDismissed()) return
    if (Notification.permission !== 'default') return
    setVisible(true)
  }, [user])

  if (!visible) return null

  const handleDismiss = () => {
    dismiss()
    setVisible(false)
  }

  const handleEnable = async () => {
    setBusy(true)
    const result = await enablePushNotifications()
    setBusy(false)
    dismiss()
    setVisible(false)
    if (!result.ok) {
      // Silent — the player can still enable it later from Profile if this failed.
    }
  }

  return (
    <div className="border-club-blue/20 bg-club-blue/5 flex flex-col gap-2 border-b px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <Bell className="text-club-blue size-4 shrink-0" />
        Active les notifications pour ne rien manquer (matchs, validations, badges...).
      </span>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button size="sm" disabled={busy} onClick={handleEnable}>
          {busy ? 'Activation...' : 'Activer'}
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
