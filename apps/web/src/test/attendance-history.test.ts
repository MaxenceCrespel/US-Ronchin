import { describe, expect, it } from 'vitest'
import { describeAttendanceChange } from '@/features/trainings/attendance-history'
import type { AttendanceStatusChangeEntry, User } from '@/lib/types'

const person = (firstName: string, lastName: string) => ({ firstName, lastName }) as User

function entry(patch: Partial<AttendanceStatusChangeEntry>): AttendanceStatusChangeEntry {
  return {
    id: 'h1',
    userId: 'u1',
    user: person('Ana', 'Martin'),
    changedBy: 'u1',
    changer: person('Ana', 'Martin'),
    previousStatus: 'PRESENT',
    newStatus: 'PRESENT',
    previousConfirmed: true,
    newConfirmed: true,
    previousConfirmedGuestCount: 0,
    newConfirmedGuestCount: 0,
    createdAt: '2026-09-24T09:00:00Z',
    ...patch,
  }
}

describe('describeAttendanceChange', () => {
  it('names who took the place of a player bumped to the waitlist', () => {
    const text = describeAttendanceChange(
      entry({ changedBy: 'u2', changer: person('Raphael', 'Dupont'), previousConfirmed: true, newConfirmed: false }),
    )
    expect(text).toBe("Place prise par Raphael D. — mis en liste d'attente")
  })

  it('names who took a guest place', () => {
    const text = describeAttendanceChange(
      entry({
        changedBy: 'u2',
        changer: person('Raphael', 'Dupont'),
        previousConfirmedGuestCount: 1,
        newConfirmedGuestCount: 0,
      }),
    )
    expect(text).toBe('Place prise par Raphael D. — 1 invité repassé en attente')
  })

  it("describes a waitlist promotion as the player's own change", () => {
    const text = describeAttendanceChange(entry({ previousConfirmed: false, newConfirmed: true }))
    expect(text).toBe("Présent → Présent — passé de liste d'attente à confirmé")
  })

  it('keeps the coach mention when a coach changes the status', () => {
    const text = describeAttendanceChange(
      entry({ changedBy: 'c1', changer: person('Coach', 'Un'), previousStatus: 'PRESENT', newStatus: 'ABSENT' }),
    )
    expect(text).toBe('Présent → Absent (par Coach U., coach)')
  })

  it('reads a first answer as coming from no response', () => {
    expect(describeAttendanceChange(entry({ previousStatus: null }))).toBe('Aucune réponse → Présent')
  })
})
