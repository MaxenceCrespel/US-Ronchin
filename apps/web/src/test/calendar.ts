import { act, screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { fixtures, meta } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

const sessions = fixtures.roles.coach['/training-sessions'] as { id: string; date: string }[]
const label = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const mondayOf = (d: Date) => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7))
  return c
}

/** Steps the week calendar (which opens on the current week) to the week of `date`, then opens
 * that day. The fixtures were recorded on one day and the tests may run on another, so the number
 * of weeks to move is computed from today rather than assumed. */
export async function openDay(user: UserEvent, date: string) {
  const weeks = Math.round((mondayOf(new Date(`${date}T12:00:00`)).getTime() - mondayOf(new Date()).getTime()) / (7 * 86_400_000))
  for (let i = 0; i < Math.abs(weeks); i++) {
    await user.click(screen.getByRole('button', { name: weeks > 0 ? 'Semaine suivante' : 'Semaine précédente' }))
    await settle(150)
  }
  await settle()
  await user.click(screen.getByRole('button', { name: new RegExp(label(date), 'i') }))
  await settle()
}

export const upcomingSessionDate = () => sessions.find((s) => s.id === meta.upcomingSessionId)!.date
export const pastSessionDate = () => sessions.find((s) => s.id === meta.sessionIds.at(-1))!.date
