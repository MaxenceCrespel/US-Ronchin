import { useCallback, useEffect, useState } from 'react'

/** Unsent edits, kept on THIS device only (per coach, via `coachId` in the key) — so a coach
 * who's rated 12 of 24 players and closes the app mid-way doesn't lose that work: reopening
 * the page reads it straight back. Cleared the moment those edits are actually saved to the
 * server (PlayerRatingsPage calls `clear()` right after the save mutation succeeds). Never
 * synced or read by anyone else — this is purely a "don't lose my unsaved work" convenience,
 * the server-side rating is the only value that ever counts. */
export function usePlayerRatingsDraft(coachId: string | undefined) {
  const key = coachId ? `player-ratings-draft:${coachId}` : null
  const [draft, setDraftState] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      setDraftState(raw ? JSON.parse(raw) : {})
    } catch {
      setDraftState({})
    }
  }, [key])

  const persist = useCallback(
    (next: Record<string, number>) => {
      setDraftState(next)
      if (!key) return
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Private browsing / full storage — the draft simply won't survive a reload, the
        // rest of the page keeps working off in-memory state.
      }
    },
    [key],
  )

  const setValue = useCallback(
    (playerId: string, rating: number) => persist({ ...draft, [playerId]: rating }),
    [draft, persist],
  )

  const clear = useCallback(() => {
    persist({})
    if (key) {
      try {
        localStorage.removeItem(key)
      } catch {
        // Same as above — non-fatal.
      }
    }
  }, [key, persist])

  return { draft, setValue, clear }
}
