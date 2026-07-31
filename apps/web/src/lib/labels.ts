import type { AttendanceStatus, PlayerPosition, PreferredFoot } from './types'

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  GOALKEEPER: 'Gardien',
  DEFENDER: 'Défenseur',
  MIDFIELDER: 'Milieu',
  FORWARD: 'Attaquant',
}

export const FOOT_LABELS: Record<PreferredFoot, string> = {
  LEFT: 'Gauche',
  RIGHT: 'Droit',
  BOTH: 'Ambidextre',
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  MAYBE: 'Incertain',
}

export const ATTENDANCE_STATUS_VARIANTS: Record<
  AttendanceStatus,
  'success' | 'destructive' | 'warning'
> = {
  PRESENT: 'success',
  ABSENT: 'destructive',
  MAYBE: 'warning',
}
