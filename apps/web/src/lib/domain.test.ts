import { describe, expect, it } from 'vitest'
import { getMatchResult } from './match-result'
import { getMatchCategory } from './match-category'
import { hasAdminAccess, hasCoachAccess } from './roles'
import { isRosterPlayer } from './roster'
import { getSeasonBounds, isInSeason, isMonthInSeason } from './season'
import { monthLabelDisplay } from './month-label'
import { isProfileComplete, needsPositionsFix } from './profile-completion'
import type { User } from './types'

const user = (over: Partial<User>) => ({ role: 'PLAYER', isPlayingCoach: false, ...over }) as User

describe('getMatchResult', () => {
  it('reads the result from our side, at home', () => {
    expect(getMatchResult({ homeAway: 'HOME', scoreHome: 3, scoreAway: 2 })).toBe('W')
    expect(getMatchResult({ homeAway: 'HOME', scoreHome: 1, scoreAway: 2 })).toBe('L')
  })

  it('reads the result from our side, away — the away score is ours', () => {
    expect(getMatchResult({ homeAway: 'AWAY', scoreHome: 3, scoreAway: 2 })).toBe('L')
    expect(getMatchResult({ homeAway: 'AWAY', scoreHome: 0, scoreAway: 4 })).toBe('W')
  })

  it('handles draws, including 0-0', () => {
    expect(getMatchResult({ homeAway: 'HOME', scoreHome: 0, scoreAway: 0 })).toBe('D')
  })

  it('is null until both scores exist', () => {
    expect(getMatchResult({ homeAway: 'HOME', scoreHome: null, scoreAway: 1 })).toBeNull()
    expect(getMatchResult({ homeAway: 'HOME', scoreHome: 1, scoreAway: null })).toBeNull()
  })
})

describe('getMatchCategory', () => {
  it('friendly wins over everything else', () => {
    expect(getMatchCategory({ source: 'FRIENDLY', competition: 'Coupe' })).toBe('FRIENDLY')
  })
  it('detects a cup by name, case-insensitively', () => {
    expect(getMatchCategory({ source: 'OFFICIAL_FFF', competition: 'COUPE de France' })).toBe('CUP')
  })
  it('everything else official is league', () => {
    expect(getMatchCategory({ source: 'OFFICIAL_FFF', competition: 'D6 Poule A' })).toBe('LEAGUE')
    expect(getMatchCategory({ source: 'OFFICIAL_FFF', competition: null })).toBe('LEAGUE')
  })
})

describe('roles', () => {
  it('superadmin has coach access, a plain coach has no admin access', () => {
    expect(hasCoachAccess(user({ role: 'SUPERADMIN' }))).toBe(true)
    expect(hasCoachAccess(user({ role: 'COACH' }))).toBe(true)
    expect(hasCoachAccess(user({ role: 'PLAYER' }))).toBe(false)
    expect(hasCoachAccess(null)).toBe(false)
    expect(hasAdminAccess(user({ role: 'COACH' }))).toBe(false)
    expect(hasAdminAccess(user({ role: 'SUPERADMIN' }))).toBe(true)
  })

  it('a playing coach is part of the roster, a pure coach is not', () => {
    expect(isRosterPlayer(user({ role: 'PLAYER' }))).toBe(true)
    expect(isRosterPlayer(user({ role: 'COACH', isPlayingCoach: true }))).toBe(true)
    expect(isRosterPlayer(user({ role: 'COACH' }))).toBe(false)
  })
})

describe('season helpers', () => {
  it('runs 1 August to 31 July', () => {
    expect(getSeasonBounds('2026-2027')).toEqual({ start: '2026-08-01', end: '2027-07-31' })
    const b = getSeasonBounds('2026-2027')
    expect(isInSeason('2026-08-01', b)).toBe(true)
    expect(isInSeason('2026-07-31', b)).toBe(false)
  })
  it('places a month label in its season', () => {
    expect(isMonthInSeason('2026-08', '2026-2027')).toBe(true)
    expect(isMonthInSeason('2027-07', '2026-2027')).toBe(true)
    expect(isMonthInSeason('2027-08', '2026-2027')).toBe(false)
  })
  it('formats a month label in French', () => {
    expect(monthLabelDisplay('2026-09')).toBe('septembre 2026')
  })
})

describe('profile completion', () => {
  const complete = { birthDate: '1990-01-01', preferredFoot: 'RIGHT', positions: ['STRIKER'] }
  it('needs birth date, foot and at least one position', () => {
    expect(isProfileComplete(user(complete as Partial<User>))).toBe(true)
    expect(isProfileComplete(user({ ...complete, birthDate: null } as Partial<User>))).toBe(false)
    expect(isProfileComplete(user({ ...complete, preferredFoot: null } as Partial<User>))).toBe(false)
    expect(isProfileComplete(user({ ...complete, positions: [] } as Partial<User>))).toBe(false)
  })
  it('flags players who kept more than 3 positions', () => {
    expect(needsPositionsFix(user({ positions: ['STRIKER', 'GOALKEEPER', 'CENTER_BACK', 'LEFT_BACK'] }))).toBe(true)
    expect(needsPositionsFix(user({ positions: ['STRIKER'] }))).toBe(false)
  })
})
