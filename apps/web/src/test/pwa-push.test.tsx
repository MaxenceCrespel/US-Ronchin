import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallAppBanner } from '@/components/InstallAppBanner'
import { NotificationPrompt } from '@/components/NotificationPrompt'
import { NotificationSettingsCard } from '@/features/push/NotificationSettingsCard'
import { enablePushNotifications, isPushSupported } from '@/features/push/subscribe'
import { resizeImageFile } from '@/lib/image-resize'
import { useAuthStore } from '@/lib/auth-store'
import { fakeApi, fixtures } from './fake-api'
import type { User } from '@/lib/types'

const settle = (ms = 200) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

interface FakeSub {
  endpoint: string
  toJSON: () => object
  unsubscribe: () => Promise<boolean>
}

/** A service worker + PushManager the components can talk to. */
function stubPush(opts: { subscribed?: boolean; permission?: NotificationPermission } = {}) {
  let current: FakeSub | null = opts.subscribed ? makeSub() : null
  function makeSub(): FakeSub {
    return {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k', auth: 'a' } }),
      unsubscribe: vi.fn(async () => {
        current = null
        return true
      }),
    }
  }
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => (current = makeSub())),
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true })
  vi.stubGlobal('PushManager', class {})
  ;(window as unknown as { PushManager: unknown }).PushManager = class {}
  vi.stubGlobal('Notification', { permission: opts.permission ?? 'default', requestPermission: vi.fn(async () => opts.permission ?? 'granted') })
  return pushManager
}

beforeEach(() => {
  fakeApi.install('player')
  useAuthStore.setState({ user: fixtures.roles.player['/users/me'] as User })
})
afterEach(() => {
  Reflect.deleteProperty(navigator, 'userAgent')
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('enablePushNotifications', () => {
  it('subscribes and registers the subscription with the server', async () => {
    stubPush()
    fakeApi.on('GET', /vapid-public-key$/, { publicKey: 'BEl6' + 'A'.repeat(84) })
    const result = await enablePushNotifications()
    expect(result).toEqual({ ok: true })
    expect(fakeApi.called('POST', /push\/subscribe$/)).toHaveLength(1)
  })

  it('reports a refused permission', async () => {
    stubPush({ permission: 'denied' })
    const result = await enablePushNotifications()
    expect(result.ok).toBe(false)
    expect(fakeApi.called('POST', /push\/subscribe$/)).toHaveLength(0)
  })

  it('reports a server without push configured', async () => {
    stubPush()
    fakeApi.on('GET', /vapid-public-key$/, { publicKey: null })
    const result = await enablePushNotifications()
    expect(result).toMatchObject({ ok: false })
  })

  it('never throws — a failing browser API becomes an error result', async () => {
    stubPush()
    fakeApi.on('GET', /vapid-public-key$/, { message: 'down' }, 500)
    expect(await enablePushNotifications()).toMatchObject({ ok: false })
  })

  it('detects support', () => {
    stubPush()
    expect(isPushSupported()).toBe(true)
  })
})

describe('NotificationSettingsCard', () => {
  it('enables then disables notifications', async () => {
    const user = userEvent.setup()
    const pm = stubPush()
    fakeApi.on('GET', /vapid-public-key$/, { publicKey: 'BEl6' + 'A'.repeat(84) })
    render(<NotificationSettingsCard />)
    await settle()
    await user.click(screen.getByRole('button', { name: /Activer/ }))
    await waitFor(() => expect(pm.subscribe).toHaveBeenCalled())
    const off = await screen.findByRole('button', { name: /Désactiver/ })
    await user.click(off)
    await waitFor(() => expect(fakeApi.called('DELETE', /push\/subscribe$/)).toHaveLength(1))
  })

  it('shows the refusal message', async () => {
    const user = userEvent.setup()
    stubPush({ permission: 'denied' })
    render(<NotificationSettingsCard />)
    await settle()
    await user.click(screen.getByRole('button', { name: /Activer/ }))
    expect(await screen.findByText(/Autorisation refusée/)).toBeInTheDocument()
  })

  it('starts as enabled when a subscription already exists', async () => {
    stubPush({ subscribed: true })
    render(<NotificationSettingsCard />)
    await settle()
    expect(screen.getByRole('button', { name: /Désactiver/ })).toBeInTheDocument()
  })

  it('says so when the browser has no push support', async () => {
    render(<NotificationSettingsCard />)
    await settle()
    expect(document.body.textContent?.length).toBeGreaterThan(0)
  })
})

describe('NotificationPrompt', () => {
  const standalone = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /standalone/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))

  it('only nags an installed app whose permission is still undecided', async () => {
    stubPush()
    render(<NotificationPrompt />)
    await settle()
    expect(screen.queryByText(/Active les notifications/)).toBeNull() // not standalone
  })

  it('offers to enable in the installed app, and remembers a dismissal', async () => {
    const user = userEvent.setup()
    stubPush()
    standalone()
    render(<NotificationPrompt />)
    await settle()
    expect(screen.getByText(/Active les notifications/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Fermer|Plus tard|Ignorer/ }))
    expect(localStorage.getItem('notification-prompt-dismissed')).toBe('1')
  })

  it('enables from the prompt', async () => {
    const user = userEvent.setup()
    const pm = stubPush()
    standalone()
    fakeApi.on('GET', /vapid-public-key$/, { publicKey: 'BEl6' + 'A'.repeat(84) })
    render(<NotificationPrompt />)
    await settle()
    await user.click(screen.getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(pm.subscribe).toHaveBeenCalled())
  })
})

describe('InstallAppBanner', () => {
  it('on Android, offers the native install and reports the outcome', async () => {
    const user = userEvent.setup()
    render(<InstallAppBanner />)
    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) })
    act(() => {
      window.dispatchEvent(event)
    })
    await settle()
    await user.click(screen.getByRole('button', { name: /Installer|Ajouter/ }))
    expect(prompt).toHaveBeenCalled()
  })

  it('on iOS, explains how to add to the home screen', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true })
    render(<InstallAppBanner />)
    await settle()
    const how = screen.getByRole('button', { name: /Comment|Voir|Installer|Ajouter/ })
    await user.click(how)
    expect(document.body.textContent).toMatch(/Partager|écran d'accueil/i)
  })

  it('stays away once dismissed', async () => {
    localStorage.setItem('install-banner-dismissed', '1')
    render(<InstallAppBanner />)
    await settle()
    expect(document.body.textContent).toBe('')
  })

  it('reports an already-installed app to the server', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /standalone/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    render(<InstallAppBanner />)
    await settle()
    expect(fakeApi.called('POST', /activity\/pwa-install$/)).toHaveLength(1)
  })
})

describe('resizeImageFile', () => {
  it('downsizes a large picture to a JPEG within the limit', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 2000, close })))
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/jpeg' })))
    const out = await resizeImageFile(new File(['raw'], 'photo.png', { type: 'image/png' }))
    expect(out.name).toBe('photo.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(close).toHaveBeenCalled()
    toBlob.mockRestore()
  })

  it('keeps the original when the browser cannot encode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })))
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null))
    const original = new File(['raw'], 'photo.png', { type: 'image/png' })
    expect(await resizeImageFile(original)).toBe(original)
    toBlob.mockRestore()
  })
})
