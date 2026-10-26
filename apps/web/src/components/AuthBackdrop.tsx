import type { ReactNode } from 'react'

/** The full-screen backdrop shared by every screen shown before (or instead of) the app
 * itself: login, joining, the validation wait, activating an invitation, completing a
 * profile. The club's dark blue with the centre circle and penalty box drawn in, faintly —
 * the same pitch markings as the rest of the redesign, never competing with the form. */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="bg-club-blue-dark relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-10">
      <svg
        aria-hidden="true"
        viewBox="0 0 400 420"
        preserveAspectRatio="xMidYMin slice"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full"
        fill="none"
        stroke="rgb(255 255 255 / 0.1)"
        strokeWidth="2"
      >
        <circle cx="200" cy="0" r="170" />
        <rect x="100" y="-1" width="200" height="90" />
        <circle cx="200" cy="0" r="6" fill="rgb(255 255 255 / 0.1)" />
      </svg>
      <div className="relative flex w-full justify-center">{children}</div>
    </div>
  )
}
