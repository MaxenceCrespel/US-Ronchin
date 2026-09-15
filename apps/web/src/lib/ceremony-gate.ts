import { create } from 'zustand'

/** Only one full-screen ceremony/reveal overlay (z-[9998], `fixed inset-0`) can ever be on
 * screen at a time — without this, a device that hasn't seen the end-of-season ceremony, a
 * newly-won monthly trophy, AND a newly-won match trophy all at once would get their
 * watchers rendering overlays simultaneously, stacked on top of each other. Priority is
 * season > monthly > match — the season ceremony is the rarest, biggest event (the whole
 * roster watches it together), so it always wins the gate outright, even preempting whatever
 * is showing; 'monthly' and 'match' are both *personal* reveals (only the actual winner ever
 * sees either — see MonthlyTrophyReveal/MatchTrophyReveal), so monthly can preempt a match
 * reveal but never the season ceremony. A watcher that gets preempted mid-display notices via
 * its own `active !== <its kind>` check and gives up rendering — see
 * MonthlyTrophyUnlockWatcher/MatchTrophyUnlockWatcher for that pattern. */
interface CeremonyGateState {
  active: 'season' | 'monthly' | 'match' | null
  claim: (kind: 'season' | 'monthly' | 'match') => boolean
  release: (kind: 'season' | 'monthly' | 'match') => void
}

export const useCeremonyGateStore = create<CeremonyGateState>()((set, get) => ({
  active: null,
  claim: (kind) => {
    const current = get().active
    if (kind === 'season') {
      set({ active: 'season' })
      return true
    }
    if (kind === 'monthly') {
      if (current === 'season') return false
      set({ active: 'monthly' })
      return true
    }
    // match — lowest priority, never preempts season or monthly.
    if (current === 'season' || current === 'monthly') return false
    set({ active: 'match' })
    return true
  },
  release: (kind) => set((s) => (s.active === kind ? { active: null } : s)),
}))
