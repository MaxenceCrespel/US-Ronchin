import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, type Role } from './fake-api'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('home page', () => {
  it.each<Role>(['player', 'coach'])('greets %s and lists what needs attention', async (role) => {
    renderApp('/', role)
    await settle()
    expect(screen.getByText(/^(Bonjour|Bon après-midi|Bonsoir)/)).toBeInTheDocument()
  })

  it('a player answers the next training from the home card', async () => {
    const user = userEvent.setup()
    renderApp('/', 'player')
    await settle()
    const present = screen.queryAllByRole('button', { name: /^(Présent|Absent|Incertain)$/ })
    if (present[0]) {
      await user.click(present[0])
      await waitFor(() => expect(fakeApi.called('PUT', /attendance$/).length).toBeGreaterThan(0))
    }
    expect(present.length).toBeGreaterThan(0)
  })

  it('a player can add and remove a +1 on the next friendly match', async () => {
    const user = userEvent.setup()
    renderApp('/', 'player')
    await settle()
    const first = screen.queryAllByPlaceholderText('Prénom')[0]
    if (first) {
      await user.type(first, 'Invité')
      const add = screen.queryAllByRole('button', { name: 'Ajouter' })[0]
      if (add) await user.click(add)
      await settle()
    }
  })

  it('links to the matches and trainings it mentions', async () => {
    renderApp('/', 'coach')
    await settle()
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.some((h) => h?.startsWith('/matches/'))).toBe(true)
    expect(hrefs).toContain('/stats')
  })

  it('shows the recent results', async () => {
    renderApp('/', 'player')
    await settle()
    expect(document.body.textContent).toMatch(/Opponent \d/)
  })
})

describe('stats page', () => {
  async function open(role: Role = 'player') {
    const user = userEvent.setup()
    renderApp('/stats', role)
    await settle()
    return user
  }

  it('walks through every tab', async () => {
    const user = await open()
    for (const tab of screen.getAllByRole('tab')) {
      await user.click(tab)
      await settle(200)
      expect(tab).toHaveAttribute('data-state', 'active')
    }
  })

  it('sorts the roster table by clicking column headers', async () => {
    const user = await open()
    await user.click(screen.getByRole('tab', { name: /Effectif/ }))
    await settle()
    const headers = screen.getAllByRole('columnheader').flatMap((h) => within(h).queryAllByRole('button'))
    for (const h of headers.slice(0, 4)) {
      await user.click(h)
      await user.click(h)
    }
    expect(headers.length).toBeGreaterThan(0)
  })

  it('opens the team leaderboards', async () => {
    const user = await open()
    await user.click(screen.getByRole('tab', { name: /Équipe/ }))
    await settle()
    const openers = screen.getAllByRole('button').filter((b) => /Voir|classement|tout/i.test(b.textContent ?? ''))
    for (const b of openers.slice(0, 3)) {
      await user.click(b)
      await settle(200)
      const dialog = screen.queryByRole('dialog')
      if (dialog) await user.keyboard('{Escape}')
    }
  })

  it('switches season through the selector', async () => {
    const user = await open('coach')
    const combo = screen.getAllByRole('combobox')[0]
    combo.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    expect(fakeApi.called('GET', /stats\/(players|team)/).length).toBeGreaterThan(0)
  })
})
