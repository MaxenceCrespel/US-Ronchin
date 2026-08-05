import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchVapidPublicKey, subscribePush, unsubscribePush } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window

export function NotificationSettingsCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupported()) {
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
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Autorisation refusée — active les notifications dans les réglages du navigateur.')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const publicKey = await fetchVapidPublicKey()
      if (!publicKey) {
        setError("Les notifications ne sont pas configurées côté serveur pour l'instant.")
        return
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      await subscribePush(subscription.toJSON() as PushSubscriptionJSON)
      setEnabled(true)
    } catch {
      setError("Impossible d'activer les notifications.")
    } finally {
      setBusy(false)
    }
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
          {isSupported()
            ? "Reçois une alerte pour les événements importants (nouveau joueur, résultat manquant, match joué, badge débloqué)."
            : "Les notifications ne sont pas prises en charge par ce navigateur."}
        </CardDescription>
      </CardHeader>
      {isSupported() && (
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
