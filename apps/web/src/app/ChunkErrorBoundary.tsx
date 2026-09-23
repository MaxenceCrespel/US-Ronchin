import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// Every route past login is React.lazy()'d (see App.tsx) — each deploy replaces dist/
// wholesale, so a tab/installed PWA left open across a deploy is still running JS that
// references chunk filenames (content-hashed by Vite) that no longer exist on the server.
// The moment it lazy-loads a route it hasn't fetched yet, that request 404s and React has
// nothing to render — with no boundary here, that crashes the WHOLE app to a blank/half-
// rendered screen instead of just failing to reach the one new page. A simple, once-only
// reload picks up the fresh HTML + matching new chunks and the app just works again — no
// user action needed beyond what a page reload already does silently on most sites.
const RELOAD_GUARD_KEY = 'chunk-error-reloaded-at'
const RELOAD_GUARD_WINDOW_MS = 10_000 // don't reload again if we just tried within 10s —
  // guards against a genuine, persistent network outage turning into a reload loop

function isChunkLoadError(message: string): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk|Load failed/i.test(
    message,
  )
}

// Fires the actual reload at most once per RELOAD_GUARD_WINDOW_MS. Deliberately NOT the
// signal the UI state is based on (see reloading below) — a chunk-load error caught twice in
// quick succession (React re-renders a throwing subtree once more in development, to get a
// clean stack trace for its own warning) must still show the same "reloading" screen the
// second time even though the second call correctly skips firing another real reload.
function triggerReloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable (private browsing) — reload once anyway, better than a
    // permanently broken screen; worst case is a single extra reload.
  }
  window.location.reload()
}

interface State {
  hasError: boolean
  reloading: boolean
}

/** Wraps the whole routed app (see App.tsx) — catches a stale-chunk crash and silently
 * reloads once to recover, and catches anything else with a small "quelque chose s'est mal
 * passé" screen instead of a blank one. Vite's own `vite:preloadError` event (fired on
 * `window`, not caught by a React error boundary — it's a plain script-tag load failure, not
 * a render error) covers the same stale-chunk case for a failure that happens outside a
 * render pass (e.g. prefetching a route's chunk before navigating to it); both funnel through
 * the same `reloadOnceFor` guard so they can't double-reload each other. */
export class ChunkErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, reloading: false }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message = error instanceof Error ? error.message : String(error)
    const reloading = isChunkLoadError(message)
    if (reloading) triggerReloadOnce()
    return { hasError: true, reloading }
  }

  componentDidMount() {
    window.addEventListener('vite:preloadError', this.handlePreloadError)
  }

  componentWillUnmount() {
    window.removeEventListener('vite:preloadError', this.handlePreloadError)
  }

  handlePreloadError = (event: Event) => {
    event.preventDefault()
    triggerReloadOnce()
    this.setState({ hasError: true, reloading: true })
  }

  render() {
    if (this.state.hasError) {
      if (this.state.reloading) {
        // The reload is already in flight (window.location.reload() was just called) —
        // this only paints for the brief moment before the browser actually navigates.
        return (
          <div className="flex min-h-svh items-center justify-center" role="status">
            <span className="sr-only">Mise à jour de l'application…</span>
            <div className="border-club-blue size-8 animate-spin rounded-full border-4 border-t-transparent" aria-hidden="true" />
          </div>
        )
      }
      return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold">Un problème est survenu</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Recharge la page — si ça persiste, préviens le coach.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
