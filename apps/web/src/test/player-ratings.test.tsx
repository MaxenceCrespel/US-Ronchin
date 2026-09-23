import { describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

const playerCount = (fixtures.roles.coach['/player-ratings/mine'] as unknown[]).length

async function openRatings() {
  const user = userEvent.setup()
  renderApp('/player-ratings', 'coach')
  await settle()
  return user
}

describe('player ratings (coach)', () => {
  it('shows the mandatory intro first, then the unrated squad', async () => {
    const user = await openRatings()
    expect(screen.getByRole('dialog', { name: 'Avant de commencer' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "J'ai compris, je commence" }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avant de commencer' })).not.toBeInTheDocument())
    expect(screen.getAllByText('Pas encore noté')).toHaveLength(playerCount)
    expect(screen.getByRole('button', { name: `Enregistrer · 0/${playerCount}` })).toBeDisabled()
  })

  it('opens and closes the full legend', async () => {
    const user = await openRatings()
    await user.click(screen.getByRole('button', { name: "J'ai compris, je commence" }))
    await user.click(screen.getByRole('button', { name: 'Tout voir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Échelle des niveaux' })
    expect(dialog).toHaveTextContent('Exceptionnel')
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Échelle des niveaux' })).not.toBeInTheDocument())
  })

  it('filters by name and by "à noter"', async () => {
    const user = await openRatings()
    await user.click(screen.getByRole('button', { name: "J'ai compris, je commence" }))
    await user.type(screen.getByPlaceholderText('Rechercher un joueur'), 'zzz-no-such-player')
    expect(await screen.findByText(/Aucun joueur ne correspond/)).toBeInTheDocument()
    await user.clear(screen.getByPlaceholderText('Rechercher un joueur'))
    await user.click(screen.getByRole('button', { name: 'À noter' }))
    expect(screen.getAllByText('Pas encore noté')).toHaveLength(playerCount)
  })

  it('requires every player rated before the save button unlocks, then confirms via the recap', async () => {
    const user = await openRatings()
    await user.click(screen.getByRole('button', { name: "J'ai compris, je commence" }))

    for (const button of screen.getAllByRole('button', { name: /^Note 7 pour / })) {
      await user.click(button)
    }

    const saveButton = await screen.findByRole('button', { name: 'Enregistrer mes notes' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)

    const recap = await screen.findByRole('dialog', { name: "Vérifie tes notes avant d'enregistrer" })
    expect(recap).toHaveTextContent('7')
    expect(recap).toHaveTextContent('Bon')

    // The fixture is static — without this, the invalidated refetch after saving would come
    // back with everyone unrated again and the UI would (correctly) treat that as still
    // needing 12 ratings, which isn't what a real save does.
    const original = fixtures.roles.coach['/player-ratings/mine'] as { userId: string }[]
    fakeApi.on('GET', /\/player-ratings\/mine$/, original.map((p) => ({ ...p, rating: 7 })))

    await user.click(screen.getByRole('button', { name: 'Confirmer et enregistrer' }))

    await waitFor(() => expect(fakeApi.called('PUT', /\/player-ratings\//)).toHaveLength(playerCount))
    expect(await screen.findByRole('button', { name: '✓ Enregistré' })).toBeInTheDocument()
  })

  it('lets a half-point be added on top of a whole rating', async () => {
    const user = await openRatings()
    await user.click(screen.getByRole('button', { name: "J'ai compris, je commence" }))
    const firstNote6 = screen.getAllByRole('button', { name: /^Note 6 pour / })[0]
    await user.click(firstNote6)
    const rowName = firstNote6.getAttribute('aria-label')!.replace('Note 6 pour ', '')
    const halfButton = screen.getByRole('button', { name: `Ajouter un demi-point pour ${rowName}` })
    await user.click(halfButton)
    expect(screen.getByText('6,5 · Correct')).toBeInTheDocument()
  })
})
