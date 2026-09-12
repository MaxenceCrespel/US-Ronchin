import { create } from 'zustand'

/** Only one full-screen ceremony/reveal overlay (z-[9998], `fixed inset-0`) can ever be on
 * screen at a time — without this, a device that hasn't seen the end-of-season ceremony, a
 * newly-won monthly trophy, a newly-won match trophy, AND the trophy-vitrine feature intro
 * all at once would get their watchers rendering overlays simultaneously, stacked on top of
 * each other. Priority is season > monthly > match > tour — the season ceremony is the
 * rarest, biggest event (the whole roster watches it together), so it always wins the gate
 * outright, even preempting whatever's showing; 'monthly' and 'match' are both *personal*
 * reveals (only the actual winner ever sees either — see MonthlyTrophyReveal/
 * MatchTrophyReveal), so monthly can preempt a match reveal but never the season ceremony;
 * 'tour' (a one-time feature announcement, see TrophyFeatureTour) is the least urgent of all
 * and only ever claims the gate when it's completely free — a genuine trophy reveal always
 * gets to happen first. A watcher that gets preempted mid-display notices via its own
 * `active !== <its kind>` check and gives up rendering — see MonthlyTrophyUnlockWatcher/
 * MatchTrophyUnlockWatcher for that pattern. */
interface CeremonyGateState {
  active: 'season' | 'monthly' | 'match' | 'tour' | null
  claim: (kind: 'season' | 'monthly' | 'match' | 'tour') => boolean
  release: (kind: 'season' | 'monthly' | 'match' | 'tour') => void
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
    if (kind === 'match') {
      if (current === 'season' || current === 'monthly') return false
      set({ active: 'match' })
      return true
    }
    // tour — lowest priority of all, only claims when absolutely nothing else is showing.
    if (current) return false
    set({ active: 'tour' })
    return true
  },
  release: (kind) => set((s) => (s.active === kind ? { active: null } : s)),
}))
