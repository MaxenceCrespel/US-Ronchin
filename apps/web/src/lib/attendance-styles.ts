import { cn } from './utils'
import type { AttendanceStatus } from './types'

const BASE = 'transition-all duration-150 hover:scale-105 active:scale-95'

const ACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 animate-pop-in',
  MAYBE: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 animate-pop-in',
  ABSENT: 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700 animate-pop-in',
}

const INACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  MAYBE: 'border-amber-300 text-amber-700 hover:bg-amber-50',
  ABSENT: 'border-rose-300 text-rose-700 hover:bg-rose-50',
}

export function attendanceButtonClass(status: AttendanceStatus, active: boolean) {
  return cn(BASE, active ? ACTIVE_CLASSES[status] : INACTIVE_CLASSES[status])
}

const SEGMENT_ACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white shadow-sm',
  MAYBE: 'bg-amber-500 text-white shadow-sm',
  ABSENT: 'bg-rose-600 text-white shadow-sm',
}

export function attendanceSegmentClass(status: AttendanceStatus, active: boolean) {
  return cn(
    'rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
    active
      ? cn(SEGMENT_ACTIVE_CLASSES[status], 'animate-pop-in')
      : 'text-muted-foreground hover:bg-background hover:text-foreground',
  )
}
