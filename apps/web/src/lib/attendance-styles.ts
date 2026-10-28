import { cn } from './utils'
import type { AttendanceStatus } from './types'

const BASE = 'transition-all duration-150 hover:scale-105 active:scale-95'

const ACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-club-blue text-white border-club-blue hover:bg-club-blue-dark animate-pop-in',
  MAYBE: 'bg-club-gold text-club-blue-dark border-club-gold hover:bg-club-gold/90 animate-pop-in',
  ABSENT: 'bg-result-loss text-white border-result-loss hover:bg-result-loss/90 animate-pop-in',
}

const INACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'border-club-blue/40 text-club-blue hover:bg-club-blue/10',
  MAYBE: 'border-amber-300 text-amber-800 hover:bg-amber-50',
  ABSENT: 'border-result-loss/40 text-result-loss hover:bg-result-loss/10',
}

export function attendanceButtonClass(status: AttendanceStatus, active: boolean) {
  return cn(BASE, active ? ACTIVE_CLASSES[status] : INACTIVE_CLASSES[status])
}

const SEGMENT_ACTIVE_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-club-blue text-white shadow-sm',
  MAYBE: 'bg-club-gold text-club-blue-dark shadow-sm',
  ABSENT: 'bg-result-loss text-white shadow-sm',
}

export function attendanceSegmentClass(status: AttendanceStatus, active: boolean) {
  return cn(
    'min-h-10 rounded-full px-4 text-sm font-semibold transition-all duration-150 active:scale-95',
    active
      ? cn(SEGMENT_ACTIVE_CLASSES[status], 'animate-pop-in')
      : 'text-muted-foreground hover:bg-background hover:text-foreground',
  )
}
