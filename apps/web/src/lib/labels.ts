import type { AttendanceStatus, PlayerPosition, PlayerSubPosition, PreferredFoot } from './types'

/** Broad pitch band, used only for `MatchComposition.position` (auto-derived per match, never
 * user-selected) — see `PlayerSubPosition`/`SUB_POSITION_LABELS` for a player's own profile positions. */
export const POSITION_LABELS: Record<PlayerPosition, string> = {
  GOALKEEPER: 'Gardien',
  DEFENDER: 'Défenseur',
  MIDFIELDER: 'Milieu',
  FORWARD: 'Attaquant',
}

export const SUB_POSITION_LABELS: Record<PlayerSubPosition, string> = {
  GOALKEEPER: 'Gardien',
  CENTER_BACK: 'Défenseur central',
  RIGHT_BACK: 'Défenseur droit',
  LEFT_BACK: 'Défenseur gauche',
  DEFENSIVE_MIDFIELDER: 'Milieu défensif',
  CENTER_MIDFIELDER: 'Milieu central',
  RIGHT_MIDFIELDER: 'Milieu droit',
  LEFT_MIDFIELDER: 'Milieu gauche',
  ATTACKING_MIDFIELDER: 'Milieu offensif',
  RIGHT_WINGER: 'Ailier droit',
  LEFT_WINGER: 'Ailier gauche',
  STRIKER: 'Attaquant',
}

/** Short codes for tight table columns — spelled-out labels above are for everywhere
 * else (forms, filters), these are only for cramped spaces like the roster table. */
export const SUB_POSITION_ABBR: Record<PlayerSubPosition, string> = {
  GOALKEEPER: 'GB',
  CENTER_BACK: 'DC',
  RIGHT_BACK: 'DD',
  LEFT_BACK: 'DG',
  DEFENSIVE_MIDFIELDER: 'MDF',
  CENTER_MIDFIELDER: 'MC',
  RIGHT_MIDFIELDER: 'MD',
  LEFT_MIDFIELDER: 'MG',
  ATTACKING_MIDFIELDER: 'MOC',
  RIGHT_WINGER: 'AD',
  LEFT_WINGER: 'AG',
  STRIKER: 'BU',
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
