import { describe, expect, it } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderApp } from './render-app'
import { meta, type Role } from './fake-api'

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 400)))

const ROUTES: [string, string, Role][] = [
  ['/', 'home', 'coach'],
  ['/', 'home', 'player'],
  ['/trainings', 'trainings', 'coach'],
  ['/trainings', 'trainings', 'player'],
  ['/matches', 'matches', 'coach'],
  ['/matches', 'matches', 'player'],
  [`/matches/${meta.matchIds[0]}`, 'played match', 'coach'],
  [`/matches/${meta.matchIds[0]}`, 'played match', 'player'],
  [`/matches/${meta.matchIds[4]}`, 'played match', 'player'],
  [`/matches/${meta.upcomingMatchId}`, 'upcoming match', 'coach'],
  [`/matches/${meta.upcomingMatchId}`, 'upcoming match', 'player'],
  ['/stats', 'stats', 'coach'],
  ['/stats', 'stats', 'player'],
  ['/players', 'players', 'coach'],
  ['/profile', 'profile', 'player'],
  ['/profile/edit', 'edit profile', 'player'],
  ['/profile/badges', 'badges', 'player'],
  ['/profile/trophies', 'trophies', 'player'],
  ['/profile/notifications', 'notifications', 'player'],
  ['/profile/password', 'password', 'player'],
  ['/profile/club', 'club settings', 'coach'],
  ['/admin/import-pdf', 'pdf import', 'coach'],
  ['/admin', 'admin kpis', 'admin'],
  ['/fix-positions', 'fix positions', 'player'],
  ['/complete-profile', 'complete profile', 'player'],
  ['/login', 'login', 'player'],
  ['/join', 'join', 'player'],
]

describe('every route renders', () => {
  it.each(ROUTES)('%s (%s, %s)', async (route, _label, role) => {
    const { container } = renderApp(route, role)
    await settle()
    expect(container.textContent?.length ?? 0).toBeGreaterThan(20)
    expect(screen.queryByText(/no fixture for/)).toBeNull()
  })
})
