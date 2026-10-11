import { describe, expect, it } from 'vitest'
import { parisWallTimeToDate } from './paris-time'

describe('parisWallTimeToDate', () => {
  it('reads a summer time as Paris time (UTC+2), whatever the phone timezone', () => {
    expect(parisWallTimeToDate('2026-10-11', '08:30').toISOString()).toBe('2026-10-11T06:30:00.000Z')
    expect(parisWallTimeToDate('2026-10-11', '08:30:00').toISOString()).toBe('2026-10-11T06:30:00.000Z')
  })

  it('reads a winter time as Paris time (UTC+1)', () => {
    expect(parisWallTimeToDate('2026-12-02', '20:00').toISOString()).toBe('2026-12-02T19:00:00.000Z')
  })

  it('defaults a missing time to midnight Paris', () => {
    expect(parisWallTimeToDate('2026-10-11', null).toISOString()).toBe('2026-10-10T22:00:00.000Z')
  })

  it("doesn't count an 08:30 Paris kickoff as started at 08:43 in Egypt (07:43 in France)", () => {
    // 08:43 on a Cairo clock (UTC+3) is 05:43 UTC, i.e. 07:43 in Paris
    const now = new Date('2026-10-11T05:43:00Z').getTime()
    expect(parisWallTimeToDate('2026-10-11', '08:30').getTime() <= now).toBe(false)
  })
})
