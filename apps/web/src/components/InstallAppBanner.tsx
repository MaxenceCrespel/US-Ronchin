import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import { isStandalone } from '@/lib/pwa'

const DISMISSED_KEY = 'install-banner-dismissed'
/** Closing the banner only hides it for a while: it comes back as a reminder as long as the
 * app still runs in a browser tab rather than installed. */
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** iOS gives a Safari tab no way to tell the app is already on the home screen (Android
 * simply stops firing beforeinstallprompt), so an installed app opened recently is the
 * signal there — otherwise an iPhone player who has it installed would get the reminder
 * every week whenever they open the site in Safari. */
const RECENTLY_OPENED_INSTALLED_MS = 30 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** True while a dismissal is recent enough to keep the banner hidden. The pre-reminder
 * value ('1', a permanent dismissal) parses as a timestamp long past, so those players get
 * the reminder too. */
function wasDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < REMIND_AFTER_MS
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  } catch {
    // non-critical — worst case the banner reappears next session
  }
}

/** Prompts the player to add the app to their home screen — Android gets a native
 * install button (via beforeinstallprompt), iOS gets step-by-step instructions since
 * Safari doesn't allow triggering the install flow programmatically. */
export function InstallAppBanner() {
  const [visible, setVisible] = useState(false)
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  const pwaLastOpenedAt = useAuthStore((s) => s.user?.pwaLastOpenedAt ?? null)

  useEffect(() => {
    if (isStandalone()) {
      // Fire-and-forget self-report for the superadmin dashboard, on every standalone launch:
      // keeps the install date from the first one and moves "last opened" forward.
      apiClient.post('/activity/pwa-install').catch(() => {})
      return
    }
    if (wasDismissed()) return

    if (isIos()) {
      const openedInstalledRecently =
        pwaLastOpenedAt !== null && Date.now() - new Date(pwaLastOpenedAt).getTime() < RECENTLY_OPENED_INSTALLED_MS
      if (!openedInstalledRecently) setVisible(true)
      return
    }

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [pwaLastOpenedAt])

  if (!visible) return null

  const handleDismiss = () => {
    dismiss()
    setVisible(false)
  }

  const handleInstall = async () => {
    if (isIos()) {
      setIosInstructionsOpen(true)
      return
    }
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
    setVisible(false)
  }

  return (
    <div className="border-club-blue/20 bg-club-blue/5 flex flex-col gap-2 border-b px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      {!iosInstructionsOpen ? (
        <>
          <span className="flex items-center gap-2">
            <Download className="text-club-blue size-4 shrink-0" />
            Installe l'appli sur ton téléphone pour y accéder plus vite.
          </span>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <Button size="sm" onClick={handleInstall}>
              Installer
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
        </>
      ) : (
        <div className="flex w-full items-start justify-between gap-3">
          <p className="flex flex-wrap items-center gap-1.5">
            Appuie sur
            <Share className="mx-0.5 inline size-4" />
            <span className="font-medium">Partager</span>, puis
            <SquarePlus className="mx-0.5 inline size-4" />
            <span className="font-medium">« Sur l'écran d'accueil »</span>.
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
