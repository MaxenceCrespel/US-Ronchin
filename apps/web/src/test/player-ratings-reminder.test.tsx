import { describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fixtures } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

const playerCount = (fixtures.roles.coach['/player-ratings/mine'] as unknown[]).length

describe('player ratings reminder', () => {
  it('greets the coach with a modal when players are still unrated, then falls back to a banner', async () => {
    const user = userEvent.setup()
    renderApp('/', 'coach')
    await settle()

    const modal = await screen.findByRole('dialog', { name: new RegExp(`Il reste ${playerCount} joueur`) })
    expect(modal).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Faire plus tard' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: new RegExp(`Il reste ${playerCount} joueur`) })).not.toBeInTheDocument())
    expect(screen.getByText(new RegExp(`Il reste ${playerCount} joueur`))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Noter' }))
    await settle()
    expect(await screen.findByRole('heading', { name: 'Noter les joueurs' })).toBeInTheDocument()
  })

  it('shows the pending count as a badge on the sidebar entry', async () => {
    renderApp('/', 'coach')
    await settle()
    expect(screen.getByText(String(playerCount))).toBeInTheDocument()
  })

  it('never shows the reminder to a player', async () => {
    renderApp('/', 'player')
    await settle()
    expect(screen.queryByText(/joueurs à noter/)).not.toBeInTheDocument()
  })
})
