import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// The recorded API fixtures were taken on 20 Sept 2026 (evening): freeze the clock there so
// "upcoming" and "past" stay what they were when recorded, whatever day the tests run.
vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-20T18:00:00Z') })

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom lacks these browser APIs the UI relies on
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('ResizeObserver', NoopObserver)
vi.stubGlobal('IntersectionObserver', NoopObserver)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
window.scrollTo = () => {}
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
// a 2D context that accepts every drawing call (confetti, avatar resize...)
const noopContext = new Proxy({} as Record<string, unknown>, {
  get: (_t, prop) => (prop === 'canvas' ? document.createElement('canvas') : () => noopContext),
  set: () => true,
})
HTMLCanvasElement.prototype.getContext = (() => noopContext) as never

// WebGL has no place in jsdom — the 3D trophy scenes render nothing in tests
vi.mock('@/features/awards/Trophy3D', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TrophyScene: () => null,
  CategoryTrophyScene: () => null,
  TrophySnapshotQueueCanvas: () => null,
}))

// Pages and overlays are code-split in the app; load them up front so a test's first render
// doesn't race the dynamic import.
await Promise.all([
  import('@/features/profile/ProfilePage'),
  import('@/features/profile/EditProfilePage'),
  import('@/features/profile/BadgesPage'),
  import('@/features/profile/NotificationsPage'),
  import('@/features/profile/PasswordPage'),
  import('@/features/profile/ClubSettingsPage'),
  import('@/features/profile/CompleteProfilePage'),
  import('@/features/profile/FixPositionsPage'),
  import('@/features/admin/AdminKpisPage'),
  import('@/features/trainings/TrainingsPage'),
  import('@/features/players/PlayersPage'),
  import('@/features/matches/MatchesPage'),
  import('@/features/matches/MatchDetailPage'),
  import('@/features/stats/StatsPage'),
  import('@/features/awards/TrophyCasePage'),
  import('@/features/pdf-import/ImportMatchPdfPage'),
  import('@/features/awards/AwardsCeremonyWatcher'),
  import('@/features/awards/MonthlyTrophyUnlockWatcher'),
  import('@/features/matches/MatchTrophyUnlockWatcher'),
  import('@/features/awards/TrophySnapshot'),
  import('@/components/OnboardingTour'),
])

// React.lazy only settles after a first render attempt: do that once per file for every code-split
// page so the tests' own first render isn't the one that pays for it.
beforeAll(async () => {
  const { warmUpLazyPages } = await import('./render-app')
  await warmUpLazyPages()
}, 60_000)
