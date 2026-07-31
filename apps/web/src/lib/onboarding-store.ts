import { create } from 'zustand'

interface OnboardingUiState {
  manualOpen: boolean
  /** True whenever the tour dialog is actually on screen (auto or manual trigger) — lets
   * other components (e.g. BadgeUnlockWatcher) know the query cache currently holds demo
   * data instead of the real account's, and stay quiet until the tour is done. */
  active: boolean
  replay: () => void
  close: () => void
  setActive: (active: boolean) => void
}

/** Lets any page (e.g. Profil → "Revoir le tutoriel") re-trigger the onboarding dialog,
 * which otherwise only auto-opens once per user via `hasSeenOnboarding`. */
export const useOnboardingUiStore = create<OnboardingUiState>()((set) => ({
  manualOpen: false,
  active: false,
  replay: () => set({ manualOpen: true }),
  close: () => set({ manualOpen: false }),
  setActive: (active) => set({ active }),
}))
