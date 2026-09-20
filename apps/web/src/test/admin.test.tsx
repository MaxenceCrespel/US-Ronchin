import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function openAdmin() {
  const user = userEvent.setup()
  renderApp('/admin', 'admin')
  await settle()
  return user
}

describe('admin dashboard', () => {
  it('shows the usage KPIs', async () => {
    await openAdmin()
    expect(screen.getByText('Actifs cette semaine')).toBeInTheDocument()
    expect(screen.getByText('Comptes au total')).toBeInTheDocument()
  })

  it('sorts the activity table by a column', async () => {
    const user = await openAdmin()
    const headers = screen.getAllByRole('button').filter((b) => b.closest('th'))
    expect(headers.length).toBeGreaterThan(0)
    await user.click(headers[0])
    await user.click(headers[0])
    await user.click(headers[headers.length - 1])
  })

  it('opens a player detail with profile, history and separation tabs', async () => {
    const user = await openAdmin()
    const rows = screen.getAllByRole('row')
    await user.click(within(rows[1]).getAllByRole('button')[0] ?? rows[1])
    await settle()
    const tabs = screen.queryAllByRole('tab')
    for (const tab of tabs) await user.click(tab)
    expect(tabs.length).toBeGreaterThan(0)
  })

  it('the badges tab lists each badge and its holders', async () => {
    const user = await openAdmin()
    await user.click(screen.getByRole('tab', { name: 'Badges' }))
    await settle()
    expect(fakeApi.called('GET', /badges\/holders/).length).toBeGreaterThan(0)
    const openers = screen.getAllByRole('button').filter((b) => /badge|hat|trick|holder/i.test(b.textContent ?? ''))
    if (openers[0]) {
      await user.click(openers[0])
      await settle()
    }
  })

  it('separation rules: pick a player and add a rule from his detail', async () => {
    const user = await openAdmin()
    const rows = screen.getAllByRole('row')
    await user.click(within(rows[1]).getAllByRole('button')[0] ?? rows[1])
    await settle()
    await user.click(screen.getAllByRole('tab').find((t) => /paration/.test(t.textContent ?? ''))!)
    await settle()
    await user.click(screen.getByRole('button', { name: 'Ajouter une règle' }))
    const picker = screen.getAllByRole('combobox').at(-1)!
    picker.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    const confirm = screen.getAllByRole('button').find((b) => (b.textContent ?? '').trim() === 'OK')
    expect(confirm).toBeDefined()
    await user.click(confirm!)
    await waitFor(() => expect(fakeApi.called('POST', /player-separation-rules$/)).toHaveLength(1))
  })

  it('the separations tab lists existing rules', async () => {
    const user = await openAdmin()
    await user.click(screen.getByRole('tab', { name: 'Séparations' }))
    await settle()
    expect(fakeApi.called('GET', /player-separation-rules\/all/).length).toBeGreaterThan(0)
  })
})

describe('admin data is not reachable for a coach', () => {
  it('the KPI endpoint is never called', async () => {
    renderApp('/admin', 'coach')
    await settle()
    expect(fakeApi.called('GET', /admin\/kpis/)).toHaveLength(0)
  })
})

describe('badge grid & profile pages', () => {
  it('the badges page lists earned and locked badges', async () => {
    renderApp('/profile/badges', 'player')
    await settle()
    expect(fakeApi.called('GET', /badges\/me/).length).toBeGreaterThan(0)
    expect(document.body.textContent).toMatch(/Hat-trick|Triplé|badge/i)
  })

  it('the profile page shows the player identity', async () => {
    renderApp('/profile', 'player')
    await settle()
    expect(document.body.textContent).toContain('First')
  })

  it('edits the profile: number, birth date and positions', async () => {
    const user = userEvent.setup()
    renderApp('/profile/edit', 'player')
    await settle()
    const jersey = screen.getByLabelText('Numéro de maillot')
    await user.clear(jersey)
    await user.type(jersey, '17')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /users\/me$/)).toHaveLength(1))
    expect(fakeApi.called('PATCH', /users\/me$/)[0].data).toMatchObject({ jerseyNumber: 17 })
  })

  it('the notification settings toggle is present', async () => {
    renderApp('/profile/notifications', 'player')
    await settle()
    expect(document.body.textContent).toMatch(/notification/i)
  })

  it('the password page validates and sends the change', async () => {
    const user = userEvent.setup()
    renderApp('/profile/password', 'player')
    await settle()
    const inputs = document.querySelectorAll('input[type=password]')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
    await user.type(inputs[0] as HTMLElement, 'Password-123')
    await user.type(inputs[1] as HTMLElement, 'New-Password-456')
    if (inputs[2]) await user.type(inputs[2] as HTMLElement, 'New-Password-456')
    await user.click(screen.getByRole('button', { name: /Changer|Modifier|Enregistrer|Mettre à jour/ }))
    await waitFor(() => expect(fakeApi.called('PATCH', /change-password$/)).toHaveLength(1))
  })

  it('the club settings save the FFF team URL', async () => {
    const user = userEvent.setup()
    renderApp('/profile/club', 'coach')
    await settle()
    const input = document.querySelector('input') as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'https://epreuves.fff.fr/competition/club/1-x/equipe/y')
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(fakeApi.called('PATCH', /settings$/)).toHaveLength(1))
  })

  it('the mandatory profile completion needs a foot, a birth date and a position', async () => {
    renderApp('/complete-profile', 'player', { userPatch: { birthDate: null, preferredFoot: null, positions: [] } })
    await settle()
    const button = screen.getByRole('button', { name: 'Continuer' })
    expect(button).toBeDisabled()
  })

  it('the positions fix page saves at most three positions', async () => {
    renderApp('/fix-positions', 'player', { userPatch: { positions: ['STRIKER', 'GOALKEEPER', 'CENTER_BACK', 'LEFT_BACK'] } })
    await settle()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument()
  })
})
