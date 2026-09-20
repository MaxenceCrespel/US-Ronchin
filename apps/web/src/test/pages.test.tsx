import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderApp } from './render-app'
import { meta } from './fake-api'

describe('smoke: pages render with real API data', () => {
  it('home (coach)', async () => {
    renderApp('/')
    await waitFor(() => expect(screen.getByText(/^(Bonjour|Bon après-midi|Bonsoir)/)).toBeInTheDocument())
  })
  it('match detail', async () => {
    renderApp(`/matches/${meta.matchIds[0]}`)
    await waitFor(() => expect(screen.getByText(/vs Opponent 0/)).toBeInTheDocument())
  })
})
