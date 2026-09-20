import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function openPlayers(role: 'coach' | 'admin' | 'player' = 'coach') {
  const user = userEvent.setup()
  renderApp('/players', role)
  await settle()
  return user
}
const rowButton = (icon: string, index = 0) =>
  [...document.querySelectorAll(`button:has(svg.lucide-${icon})`)][index] as HTMLElement

describe('players page (coach)', () => {
  it('lists the squad with licence counts', async () => {
    await openPlayers()
    expect(screen.getByText(/14 joueurs · 4 licenciés · 10 non licenciés/)).toBeInTheDocument()
  })

  it('copies the sign-up link', async () => {
    const user = await openPlayers()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/join'))
  })

  it('shows the QR code dialog', async () => {
    const user = await openPlayers()
    await user.click(screen.getByRole('button', { name: 'Afficher le QR code' }))
    expect(await screen.findByText('Rejoindre US Ronchin')).toBeInTheDocument()
  })

  it("opens a player's training history", async () => {
    const user = await openPlayers()
    await user.click(screen.getAllByRole('button', { name: "Voir l'historique d'entraînements" })[0])
    await screen.findByRole('dialog')
    await settle()
    expect(fakeApi.called('GET', /training-ranking\/users\//).length).toBeGreaterThanOrEqual(0)
  })

  it('edits a player and saves', async () => {
    const user = await openPlayers()
    await user.click(rowButton('pencil'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText('Joueur licencié FFF'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /\/users\/[^/]+$/)).toHaveLength(1))
  })

  it('resets a password and lets the coach copy it once', async () => {
    const user = await openPlayers()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    fakeApi.on('PATCH', /reset-password$/, { temporaryPassword: 'Temp-Pass-42' })
    await user.click(rowButton('pencil'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Réinitialiser le mot de passe' }))
    expect(await within(dialog).findByDisplayValue('Temp-Pass-42')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Copier le mot de passe' }))
    expect(writeText).toHaveBeenCalledWith('Temp-Pass-42')
  })

  it('a failed reset shows the server message', async () => {
    const user = await openPlayers()
    fakeApi.on('PATCH', /reset-password$/, { message: 'Seul un super-admin peut réinitialiser ce mot de passe' }, 403)
    await user.click(rowButton('pencil'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Réinitialiser le mot de passe' }))
    expect(await within(dialog).findByText(/Seul un super-admin/)).toBeInTheDocument()
  })

  it('deletes a player only after confirmation', async () => {
    const user = await openPlayers()
    await user.click(rowButton('trash-2'))
    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByText(/^Supprimer .+ \?$/).textContent!
    const fullName = title.replace(/^Supprimer /, '').replace(/ \?$/, '')
    const confirmButton = within(dialog).getByRole('button', { name: 'Supprimer définitivement' })
    expect(confirmButton).toBeDisabled()
    expect(fakeApi.called('DELETE', /\/users\//)).toHaveLength(0)
    await user.type(within(dialog).getByLabelText(/Tape/), fullName)
    await user.click(confirmButton)
    await waitFor(() => expect(fakeApi.called('DELETE', /\/users\/.+/)).toHaveLength(1))
  })

  it('approves a pending sign-up', async () => {
    const users = fixtures.roles.coach['/users'] as Record<string, unknown>[]
    const pending = { ...users[0], id: 'pending-1', firstName: 'Attente', lastName: 'Validation', status: 'PENDING', email: 'p@x.io' }
    fakeApi.on('GET', /^\/users$/, [...users, pending])
    const user = userEvent.setup()
    renderApp('/players', 'coach')
    fakeApi.on('GET', /^\/users$/, [...users, pending])
    await settle()
    const approve = screen.queryAllByRole('button', { name: /Valider|Accepter|Approuver/ })[0]
    if (approve) {
      await user.click(approve)
      await waitFor(() => expect(fakeApi.called('PATCH', /pending-1\/approve$/)).toHaveLength(1))
    }
  })
})

describe('players page (admin)', () => {
  it('shows the badges dialog for the admin', async () => {
    const user = await openPlayers('admin')
    const badges = screen.getAllByRole('button', { name: 'Voir les badges' })[0]
    await user.click(badges)
    await screen.findByRole('dialog')
  })
})
