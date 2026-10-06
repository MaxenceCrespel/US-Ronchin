import { describe, expect, it } from 'vitest'
import { isTopVoted, namesLine, topVoted } from './winners'

const r = (userId: string, votes: number) => ({ userId, votes })

describe('topVoted', () => {
  it('keeps only the players tied on the top vote count', () => {
    expect(topVoted([r('a', 3), r('b', 3), r('c', 1)]).map((w) => w.userId)).toEqual(['a', 'b'])
  })

  it('returns nobody without results or votes', () => {
    expect(topVoted(null)).toEqual([])
    expect(topVoted([])).toEqual([])
    expect(topVoted([r('a', 0)])).toEqual([])
  })
})

describe('isTopVoted', () => {
  it('counts every co-winner, never a runner-up', () => {
    const results = [r('a', 2), r('b', 2), r('c', 1)]
    expect(isTopVoted(results, 'a')).toBe(true)
    expect(isTopVoted(results, 'b')).toBe(true)
    expect(isTopVoted(results, 'c')).toBe(false)
    expect(isTopVoted(results, undefined)).toBe(false)
  })
})

describe('namesLine', () => {
  it('names every winner', () => {
    expect(namesLine(['A'])).toBe('A')
    expect(namesLine(['A', 'B'])).toBe('A et B')
    expect(namesLine(['A', 'B', 'C', 'D'])).toBe('A, B, C et D')
  })
})
