import { create } from 'zustand'

/** Shared between MandatoryVotePopup (which writes it, via its own close button) and
 * VoteReminderBanner (which reads it, to know whether to show its non-dismissible nudge, and
 * writes it back to false to reopen the popup from its own CTA). Session-only, not persisted
 * — a fresh page load always shows the popup again first if something's still pending, same
 * as before this existed. */
interface VotePopupDismissedState {
  dismissed: boolean
  dismiss: () => void
  reopen: () => void
}

export const useVotePopupDismissedStore = create<VotePopupDismissedState>()((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  reopen: () => set({ dismissed: false }),
}))
