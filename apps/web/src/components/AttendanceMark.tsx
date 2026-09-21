import { ATTENDANCE_STATUS_LABELS } from '@/lib/labels'
import type { AttendanceStatus } from '@/lib/types'

const SYMBOLS: Record<AttendanceStatus, string> = { PRESENT: '✓', MAYBE: '?', ABSENT: '✗' }

/** Presence status that doesn't rest on colour alone: a symbol for sighted users who can't
 * tell green from red, and the spelled-out status for screen readers. */
export function AttendanceMark({ status }: { status: AttendanceStatus | null }) {
  if (!status) return null
  return (
    <>
      <span aria-hidden="true">{SYMBOLS[status]} </span>
      <span className="sr-only">{ATTENDANCE_STATUS_LABELS[status]} : </span>
    </>
  )
}
