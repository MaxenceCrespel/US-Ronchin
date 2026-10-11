import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { hoursAheadOfParis, parisWallTimeToDate } from './paris-time'
import { ParisTimeNotice } from '@/components/ParisTimeNotice'

afterEach(() => vi.restoreAllMocks())

/** Puts the "phone" on a timezone `minutesAheadOfUtc` ahead of UTC. */
const phoneOffset = (minutesAheadOfUtc: number) =>
  vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-minutesAheadOfUtc)

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

describe('hoursAheadOfParis', () => {
  const october = new Date('2026-10-11T05:43:00Z')
  it('is 0 in France', () => {
    phoneOffset(120)
    expect(hoursAheadOfParis(october)).toBe(0)
  })
  it('is +1 in Egypt and -2 on UTC', () => {
    phoneOffset(180)
    expect(hoursAheadOfParis(october)).toBe(1)
    vi.restoreAllMocks()
    phoneOffset(0)
    expect(hoursAheadOfParis(october)).toBe(-2)
  })
})

describe('ParisTimeNotice', () => {
  it('tells a player abroad that times are French time', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(function (this: Date) {
      // Egypt: always one hour ahead of Paris — UTC+3 in summer time, UTC+2 in winter
      const parisSummer = this.getUTCMonth() >= 2 && this.getUTCMonth() <= 9
      return parisSummer ? -180 : -120
    })
    const { container } = render(<ParisTimeNotice />)
    expect(container.textContent).toMatch(/heure de France — ton téléphone a 1 h d'avance/)
  })

  it('stays hidden in France', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(function (this: Date) {
      const parisSummer = this.getUTCMonth() >= 2 && this.getUTCMonth() <= 9
      return parisSummer ? -120 : -60
    })
    const { container } = render(<ParisTimeNotice />)
    expect(container.textContent).toBe('')
  })
})
