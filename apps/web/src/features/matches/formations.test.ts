import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMATION, FORMATIONS, positionCodes, slotCodes } from './formations'
import { bandForY } from './PitchFormationEditor'

const VALID_CODES = new Set(['GB', 'DG', 'DC', 'DD', 'MDF', 'MC', 'MG', 'MD', 'MOC', 'AG', 'AD', 'BU'])

describe('formations', () => {
  it('includes the default and the two 4-4-2 variants', () => {
    expect(FORMATIONS[DEFAULT_FORMATION]).toBeDefined()
    expect(FORMATIONS['4-4-2 à plat']).toBeDefined()
    expect(FORMATIONS['4-4-2 losange']).toBeDefined()
  })

  it.each(Object.entries(FORMATIONS))('%s fields exactly 10 outfield players + a goalkeeper', (_key, f) => {
    expect(f.rows.reduce((n, r) => n + r.slots.length, 0)).toBe(10)
  })

  it.each(Object.entries(FORMATIONS))('%s only uses known position codes and row size matches ratio', (_key, f) => {
    for (const row of f.rows) {
      expect(row.ratio).toBe(row.slots.length)
      for (const code of row.slots) expect(VALID_CODES.has(code)).toBe(true)
    }
  })

  it.each(Object.entries(FORMATIONS))('%s lists rows from back to front', (_key, f) => {
    const ys = f.rows.map((r) => r.y)
    expect([...ys].sort((a, b) => b - a)).toEqual(ys)
  })

  it.each(Object.entries(FORMATIONS))('%s keeps each row in the band its codes imply', (_key, f) => {
    const first = f.rows[0]
    expect(first.slots.every((c) => c.startsWith('D'))).toBe(true)
    expect(bandForY(first.y)).toBe('DEFENDER')
    const last = f.rows[f.rows.length - 1]
    expect(bandForY(last.y)).toBe('FORWARD')
  })

  it('assigns slot codes in lineup order, goalkeeper first', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i}`)
    const codes = slotCodes('4-4-2 à plat', ids)
    expect(codes.p0).toBe('GB')
    expect(codes.p1).toBe('DG')
    expect(codes.p4).toBe('DD')
    expect(codes.p10).toBe('BU')
  })

  it('falls back to the default system for an unknown key and copes with a short lineup', () => {
    expect(slotCodes('nope', ['a', 'b'])).toEqual({ a: 'GB', b: 'DG' })
    expect(slotCodes('4-3-3', [])).toEqual({})
  })

  it('translates profile positions to their short codes', () => {
    expect(positionCodes(['RIGHT_BACK', 'STRIKER'])).toEqual(['DD', 'BU'])
    expect(positionCodes(null)).toEqual([])
  })
})

describe('bandForY', () => {
  it('splits the pitch into goalkeeper / defence / midfield / attack', () => {
    expect(bandForY(92)).toBe('GOALKEEPER')
    expect(bandForY(70)).toBe('DEFENDER')
    expect(bandForY(45)).toBe('MIDFIELDER')
    expect(bandForY(18)).toBe('FORWARD')
  })
})
