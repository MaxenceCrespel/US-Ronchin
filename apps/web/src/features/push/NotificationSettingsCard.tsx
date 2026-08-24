import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { unsubscribePush } from './api'
import { enablePushNotifications, isPushSupported } from './subscribe'

export function NotificationSettingsCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) {
      setLoading(false)
      return
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(subscription !== null))
      .finally(() => setLoading(false))
  }, [])

  async function handleEnable() {
    setBusy(true)
    setError(null)
    const result = await enablePushNotifications()
    if (result.ok) {
      setEnabled(true)
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  async function handleDisable() {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribePush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setEnabled(false)
    } catch {
      setError('Impossible de désactiver les notifications.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          Notifications
        </CardTitle>
        <CardDescription>
          {isPushSupported()
            ? "Reçois une alerte pour les événements importants (nouveau joueur, résultat manquant, match joué, badge débloqué)."
            : "Les notifications ne sont pas prises en charge par ce navigateur."}
        </CardDescription>
      </CardHeader>
      {isPushSupported() && (
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant={enabled ? 'outline' : 'default'}
            disabled={busy}
            onClick={enabled ? handleDisable : handleEnable}
          >
            {enabled ? 'Désactiver les notifications' : 'Activer les notifications'}
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </CardContent>
      )}
    </Card>
  )
}
