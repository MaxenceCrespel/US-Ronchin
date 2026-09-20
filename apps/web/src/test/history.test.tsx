import { describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi } from './fake-api'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const entry = (i: number, over: Record<string, unknown> = {}) => ({
  sessionId: `s${i}`,
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  cancelled: false,
  declaredStatus: 'PRESENT',
  actualStatus: 'PRESENT',
  teamIndex: i % 2,
  scoreTeam0: 4,
  scoreTeam1: 1,
  points: 6,
  ...over,
})

async function openHistory(entries: unknown[]) {
  const user = userEvent.setup()
  renderApp('/players', 'coach')
  fakeApi.on('GET', /training-ranking\/users\//, entries)
  await settle()
  await user.click(screen.getAllByRole('button', { name: "Voir l'historique d'entraînements" })[0])
  await settle()
  return screen.getByRole('dialog')
}

describe('a player’s training history', () => {
  it('lists each session with declared vs real presence, team, score and points', async () => {
    const dialog = await openHistory([
      entry(1),
      entry(2, { declaredStatus: 'PRESENT', actualStatus: 'ABSENT', points: 0, teamIndex: null }), // "beau parleur"
      entry(3, { declaredStatus: 'ABSENT', actualStatus: 'PRESENT', points: 3, scoreTeam0: 2, scoreTeam1: 2 }),
      entry(4, { declaredStatus: null, actualStatus: null, points: null, scoreTeam0: null, scoreTeam1: null }),
      entry(5, { cancelled: true }),
      entry(6, { declaredStatus: 'MAYBE' }),
    ])
    expect(dialog.textContent).toMatch(/Présent/)
    expect(dialog.textContent).toMatch(/Absent/)
    expect(dialog.textContent).toMatch(/Incertain|Annulé|Annulée/)
    expect(within(dialog).getAllByRole('row').length).toBeGreaterThan(3)
  })

  it('says when there is nothing to show', async () => {
    const dialog = await openHistory([])
    expect(dialog.textContent?.length).toBeGreaterThan(10)
  })
})
