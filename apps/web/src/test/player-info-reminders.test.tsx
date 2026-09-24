import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures } from './fake-api'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

const users = fixtures.roles.coach['/users'] as Record<string, unknown>[]

describe('new player info to fill in', () => {
  it('lists a missing seniority in "À traiter" on the coach home', async () => {
    renderApp('/', 'coach')
    fakeApi.on('GET', /^\/users$/, [{ ...users[0], firstName: 'Nou', lastName: 'Veau', seniorityToReview: true }, ...users.slice(1)])
    await settle(900)
    expect(await screen.findByText('Ancienneté à renseigner — Nou Veau')).toBeInTheDocument()
  })

  it('says how many when several players still need a seniority', async () => {
    renderApp('/', 'coach')
    fakeApi.on('GET', /^\/users$/, users.map((u, i) => (i < 3 ? { ...u, seniorityToReview: true } : u)))
    await settle(900)
    expect(await screen.findByText('Ancienneté à renseigner pour 3 joueurs')).toBeInTheDocument()
  })

  it('shows nothing for a player, and nothing once everything is filled in', async () => {
    renderApp('/', 'player')
    await settle(900)
    expect(screen.queryByText(/à renseigner/)).not.toBeInTheDocument()
  })

  it('pops up after accepting a player, asking for the seniority, and can be dismissed', async () => {
    const pending = { ...users[0], id: 'pending-y', firstName: 'Tout', lastName: 'Neuf', status: 'PENDING', email: 'n@x.io', accountActivated: true }
    const user = userEvent.setup()
    renderApp('/players', 'coach')
    fakeApi.on('GET', /^\/users$/, [...users, pending])
    fakeApi.on('PATCH', /pending-y\/approve$/, { ...pending, status: 'ACTIVE', seniorityToReview: true })
    await settle(900)
    await user.click(screen.getAllByRole('button', { name: 'Approuver' })[0])

    const dialog = await screen.findByRole('dialog', { name: /Tout Neuf rejoint l'effectif/ })
    expect(within(dialog).getByText('Ancienneté')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Compris' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /rejoint l'effectif/ })).not.toBeInTheDocument())
  })

  it('keeps the seniority reminder when the fiche is saved untouched, clears it once chosen', async () => {
    const flagged = { ...users[0], firstName: 'Unique', lastName: 'Signale', seniorityToReview: true, seniorityTier: null }
    const user = userEvent.setup()
    renderApp('/players', 'coach')
    fakeApi.on('GET', /^\/users$/, [flagged, ...users.slice(1)])
    await settle(900)

    await user.click(screen.getAllByRole('button', { name: `Modifier ${flagged.firstName} ${flagged.lastName}` })[0])
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/À renseigner : choisis/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /\/users\/[^/]+$/)).toHaveLength(1))
    expect(fakeApi.called('PATCH', /\/users\/[^/]+$/)[0].data).not.toHaveProperty('seniorityTier')

    await settle()
    await user.click(screen.getAllByRole('button', { name: `Modifier ${flagged.firstName} ${flagged.lastName}` })[0])
    dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByRole('combobox', { name: 'Ancienneté au club' })
    select.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /\/users\/[^/]+$/)).toHaveLength(2))
    expect(fakeApi.called('PATCH', /\/users\/[^/]+$/)[1].data).toHaveProperty('seniorityTier')
  })
})
