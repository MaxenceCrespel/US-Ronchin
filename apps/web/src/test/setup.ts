import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
