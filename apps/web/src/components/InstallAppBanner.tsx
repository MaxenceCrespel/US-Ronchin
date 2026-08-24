import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isStandalone } from '@/lib/pwa'

const DISMISSED_KEY = 'install-banner-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

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

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return

    if (isIos()) {
      setVisible(true)
      return
    }

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

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
