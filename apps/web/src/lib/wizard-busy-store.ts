import { create } from 'zustand'

interface WizardBusyState {
  /** True while MatchDetailPage has either of its own full-screen flows open: the coach's
   * post-match configuration wizard (présence → composition → événements), or any player's
   * mandatory vote/notes dialog (homme du match, patron de la défense, notes) — a badge
   * earned mid-fill (e.g. a win-streak badge, only knowable once the score just saved/voted
   * around is in) must not pop a full-screen reveal over either one. BadgeUnlockWatcher still
   * detects and queues it as usual, it just holds off rendering until this flips back to
   * false, same as it already waits out the onboarding tour. */
  busy: boolean
  setBusy: (busy: boolean) => void
}

export const useWizardBusyStore = create<WizardBusyState>()((set) => ({
  busy: false,
  setBusy: (busy) => set({ busy }),
}))
