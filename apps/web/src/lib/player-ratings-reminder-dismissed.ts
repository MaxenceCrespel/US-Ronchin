import { create } from 'zustand'

/** Session-only, not persisted — mirrors useVotePopupDismissedStore. "Faire plus tard"
 * closes the reminder modal for the rest of THIS session (PlayerRatingsReminder still shows
 * a non-dismissible banner underneath, same relationship as VoteReminderBanner/
 * MandatoryVotePopup) and it reopens fresh on the next app load if ratings are still
 * missing. */
interface PlayerRatingsReminderDismissedState {
  dismissed: boolean
  dismiss: () => void
}

export const usePlayerRatingsReminderDismissedStore = create<PlayerRatingsReminderDismissedState>()(
  (set) => ({
    dismissed: false,
    dismiss: () => set({ dismissed: true }),
  }),
)
