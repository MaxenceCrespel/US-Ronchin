import { describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi } from './fake-api'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('onboarding tour', () => {
  it('starts for a brand-new player, walks every step and records that it was seen', async () => {
    const user = userEvent.setup()
    renderApp('/', 'player', { userPatch: { hasSeenOnboarding: false } })
    await settle(900)

    let steps = 0
    for (let i = 0; i < 40 && fakeApi.called('PATCH', /users\/me$/).length === 0; i++) {
      const next = screen
        .queryAllByRole('button')
        .find((b) => /^(Suivant|Continuer|Terminer|C'est parti|Commencer|Compris|Let's go)/i.test((b.textContent ?? '').trim()) && !b.hasAttribute('disabled'))
      if (!next) break
      await user.click(next)
      steps++
      await settle(350)
    }
    expect(steps).toBeGreaterThan(3)
    await waitFor(() => expect(fakeApi.called('PATCH', /users\/me$/).length).toBeGreaterThan(0))
    expect(fakeApi.called('PATCH', /users\/me$/)[0].data).toMatchObject({ hasSeenOnboarding: true })
  }, 60_000)

  it('can be skipped', async () => {
    const user = userEvent.setup()
    renderApp('/', 'player', { userPatch: { hasSeenOnboarding: false } })
    await settle(900)
    const skip = screen.queryAllByRole('button').find((b) => /Passer|Ignorer|Fermer le tutoriel|Plus tard/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')))
    if (skip) {
      await user.click(skip)
      await settle()
      await waitFor(() => expect(fakeApi.called('PATCH', /users\/me$/).length).toBeGreaterThan(0))
    }
  })

  it('can be replayed from the header', async () => {
    const user = userEvent.setup()
    renderApp('/', 'player')
    await settle()
    await user.click(screen.getByRole('button', { name: /Revoir le tutoriel/ }))
    await settle(800)
    expect(screen.queryAllByRole('button').some((b) => /Suivant|Commencer|Passer/i.test(b.textContent ?? ''))).toBe(true)
  })

  it('does not show for a returning player', async () => {
    renderApp('/', 'player')
    await settle(900)
    expect(fakeApi.called('PATCH', /users\/me$/)).toHaveLength(0)
  })
})
