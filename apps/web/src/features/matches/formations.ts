import { SUB_POSITION_ABBR } from '@/lib/labels'
import type { PlayerSubPosition } from '@/lib/types'

export interface FormationRow {
  /** Row size — doubles as the ratio used to spread fewer than 11 players over the rows. */
  ratio: number
  y: number
  /** Position code expected in each slot of the row, left to right (same abbreviations as a
   * player's profile positions, see SUB_POSITION_ABBR). */
  slots: string[]
}

const row = (y: number, slots: string[]): FormationRow => ({ ratio: slots.length, y, slots })
const D4 = ['DG', 'DC', 'DC', 'DD']
const D5 = ['DG', 'DC', 'DC', 'DC', 'DD']
const D3 = ['DC', 'DC', 'DC']

export const FORMATIONS: Record<string, { label: string; rows: FormationRow[] }> = {
  '4-4-2 à plat': {
    label: '4-4-2 à plat',
    rows: [row(70, D4), row(45, ['MG', 'MC', 'MC', 'MD']), row(18, ['BU', 'BU'])],
  },
  '4-4-2 losange': {
    label: '4-4-2 losange',
    rows: [row(72, D4), row(58, ['MDF']), row(44, ['MG', 'MD']), row(31, ['MOC']), row(16, ['BU', 'BU'])],
  },
  '4-3-3': {
    label: '4-3-3',
    rows: [row(70, D4), row(45, ['MC', 'MDF', 'MC']), row(18, ['AG', 'BU', 'AD'])],
  },
  '3-5-2': {
    label: '3-5-2',
    rows: [row(72, D3), row(45, ['MG', 'MC', 'MDF', 'MC', 'MD']), row(18, ['BU', 'BU'])],
  },
  '3-4-3': {
    label: '3-4-3',
    rows: [row(72, D3), row(45, ['MG', 'MC', 'MC', 'MD']), row(18, ['AG', 'BU', 'AD'])],
  },
  '5-3-2': {
    label: '5-3-2',
    rows: [row(75, D5), row(45, ['MC', 'MDF', 'MC']), row(18, ['BU', 'BU'])],
  },
  '4-1-4-1': {
    label: '4-1-4-1',
    rows: [row(72, D4), row(58, ['MDF']), row(38, ['MG', 'MC', 'MC', 'MD']), row(16, ['BU'])],
  },
  '4-5-1': {
    label: '4-5-1',
    rows: [row(70, D4), row(42, ['MG', 'MC', 'MDF', 'MC', 'MD']), row(16, ['BU'])],
  },
  '3-4-1-2': {
    label: '3-4-1-2',
    rows: [row(72, D3), row(52, ['MG', 'MC', 'MC', 'MD']), row(33, ['MOC']), row(16, ['BU', 'BU'])],
  },
  '4-2-3-1': {
    label: '4-2-3-1',
    rows: [row(72, D4), row(55, ['MDF', 'MDF']), row(35, ['AG', 'MOC', 'AD']), row(15, ['BU'])],
  },
}
export const DEFAULT_FORMATION = '4-4-2 à plat'

/** Position code of each slot, in lineup order (index 0 = goalkeeper). */
export function slotCodes(formationKey: string, ids: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (ids.length === 0) return out
  out[ids[0]] = 'GB'
  const codes = (FORMATIONS[formationKey] ?? FORMATIONS[DEFAULT_FORMATION]).rows.flatMap((r) => r.slots)
  ids.slice(1).forEach((id, i) => {
    if (codes[i]) out[id] = codes[i]
  })
  return out
}

export function positionCodes(positions: PlayerSubPosition[] | null | undefined): string[] {
  return (positions ?? []).map((p) => SUB_POSITION_ABBR[p])
}
