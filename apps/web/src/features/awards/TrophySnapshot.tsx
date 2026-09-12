import { lazy, Suspense, useEffect } from 'react'
import { create } from 'zustand'

// Lazy — TrophySnapshotHost is mounted at the app root for every page (see Layout.tsx), so
// an eager import here would pull three.js into the main bundle for devices that never open
// a trophy-related screen at all. Only actually loads once something first calls
// useTrophySnapshot and the queue goes from empty to non-empty.
const TrophySnapshotQueueCanvas = lazy(() =>
  import('./Trophy3D').then((m) => ({ default: m.TrophySnapshotQueueCanvas })),
)

/** A shelf can show several *different* trophy models side by side (the trophy case's whole
 * point) — each one live would mean its own WebGL context, and browsers cap how many can
 * exist on a page at once (commonly single digits); go past it and the overflow just renders
 * blank, no console error, no exception, nothing to catch. Since shelf trophies are static
 * anyway (spinning is reserved for the moment a trophy is won or opened big — see
 * TrophyCasePage), rendering each one once to a still PNG and reusing that image is both the
 * fix and strictly cheaper: one snapshot per (category, period) combo, generated one at a
 * time through a single persistent offscreen canvas (see TrophySnapshotHost /
 * TrophySnapshotQueueCanvas), cached forever for the rest of the session. */

export function snapshotKey(categoryKey: string, period?: string): string {
  return `${categoryKey}:${period ?? ''}`
}

interface SnapshotRequest {
  categoryKey: string
  period?: string
}

interface SnapshotStore {
  cache: Record<string, string>
  queue: string[]
  requests: Record<string, SnapshotRequest>
  request: (key: string, req: SnapshotRequest) => void
  resolve: (key: string, dataUrl: string) => void
}

const useSnapshotStore = create<SnapshotStore>((set, get) => ({
  cache: {},
  queue: [],
  requests: {},
  request: (key, req) => {
    const { cache, queue, requests } = get()
    if (cache[key] || requests[key]) return
    set({ queue: [...queue, key], requests: { ...requests, [key]: req } })
  },
  resolve: (key, dataUrl) => {
    set((s) => ({
      cache: { ...s.cache, [key]: dataUrl },
      queue: s.queue.filter((k) => k !== key),
    }))
  },
}))

/** A cached still image of this trophy — `null` while it's queued/generating (the caller
 * shows its own placeholder, same as a Suspense fallback would). */
export function useTrophySnapshot(categoryKey: string, period?: string): string | null {
  const key = snapshotKey(categoryKey, period)
  const dataUrl = useSnapshotStore((s) => s.cache[key] ?? null)
  const request = useSnapshotStore((s) => s.request)
  useEffect(() => {
    if (!dataUrl) request(key, { categoryKey, period })
  }, [key, dataUrl, categoryKey, period, request])
  return dataUrl
}

/** Mounted once at the app root (see Layout.tsx) — works through the snapshot queue one item
 * at a time via a single long-lived Canvas (TrophySnapshotQueueCanvas) that's never torn
 * down between items, only ever swapping which trophy sits inside it. Renders nothing
 * visible: positioned far outside the viewport rather than `display:none`/`visibility:
 * hidden`, since either of those can stop a browser from actually rendering frames into the
 * canvas at all. */
export function TrophySnapshotHost() {
  const queue = useSnapshotStore((s) => s.queue)
  const requests = useSnapshotStore((s) => s.requests)
  const resolve = useSnapshotStore((s) => s.resolve)
  const currentKey = queue[0]
  const current = currentKey ? requests[currentKey] : undefined
  if (!currentKey || !current) return null

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', top: 0, left: -99999, width: 256, height: 256, pointerEvents: 'none' }}
    >
      <Suspense fallback={null}>
        <TrophySnapshotQueueCanvas
          itemKey={currentKey}
          categoryKey={current.categoryKey}
          period={current.period}
          onSnapshot={(dataUrl) => resolve(currentKey, dataUrl)}
        />
      </Suspense>
    </div>
  )
}
