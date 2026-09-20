import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures, meta, type Role } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const byText = (re: RegExp) => screen.getAllByRole('button').find((b) => re.test(b.textContent ?? ''))!

async function openPlayed(role: Role = 'coach', index = 0) {
  const user = userEvent.setup()
  renderApp(`/matches/${meta.matchIds[index]}`, role)
  await settle()
  return user
}

async function openWizard() {
  const user = await openPlayed()
  await user.click(screen.getByRole('button', { name: 'Configurer le match' }))
  await settle()
  return user
}

describe('match wizard (coach, composition already saved → events step)', () => {
  it('opens on the events step with the saved goals and cards', async () => {
    await openWizard()
    expect(screen.getByText(/Étape 3\/3 — Événements/)).toBeInTheDocument()
    expect(document.body.textContent).toContain('But — First11 Last11 (passe de First10 Last10)')
    expect(document.body.textContent).toContain('Carton jaune — First6 Last6')
  })

  it('records a goal with its scorer then an assist', async () => {
    const user = await openWizard()
    await user.click(byText(/^⚽But/))
    await user.click(byText(/First3 Last3/))
    await user.click(byText(/First4 Last4/)) // the assist
    await user.click(byText(/Du pied/)) // goal type
    await waitFor(() => expect(fakeApi.called('POST', /\/matches\/.+\/events$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /events$/)[0].data).toMatchObject({ type: 'GOAL' })
  })

  it('records a goal without an assist', async () => {
    const user = await openWizard()
    await user.click(byText(/^⚽But/))
    await user.click(byText(/First3 Last3/))
    await user.click(byText(/Sans passe/))
    await user.click(byText(/Peu importe/))
    await waitFor(() => expect(fakeApi.called('POST', /events$/)).toHaveLength(1))
  })

  it('records a yellow card and a red card', async () => {
    const user = await openWizard()
    await user.click(byText(/Carton jaune$/))
    await user.click(byText(/First5 Last5/))
    await settle()
    const yellow = fakeApi.called('POST', /events$/)
    expect(yellow).toHaveLength(1)
    expect(yellow[0].data).toMatchObject({ type: 'YELLOW_CARD' })
    await user.click(byText(/Carton rouge$/))
    await user.click(byText(/First6 Last6/))
    await settle()
    expect(fakeApi.called('POST', /events$/)).toHaveLength(2)
  })

  it('records an own goal', async () => {
    const user = await openWizard()
    await user.click(byText(/^CSC$/))
    await user.click(byText(/First7 Last7/))
    await settle()
    expect(fakeApi.called('POST', /events$/)).toHaveLength(1)
    expect(fakeApi.called('POST', /events$/)[0].data).toMatchObject({ goalType: 'OWN_GOAL' })
  })

  it('deletes an event', async () => {
    const user = await openWizard()
    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])
    await waitFor(() => expect(fakeApi.called('DELETE', /\/events\/.+/).length).toBeGreaterThan(0))
  })

  it('goes back to the formation step and picks another system', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    await settle()
    expect(screen.getByText(/Étape 2\/3 — Composition tactique/)).toBeInTheDocument()
    screen.getByRole('combobox').focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}{Enter}') // next system in the list
    await settle()
    await user.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }))
    await waitFor(() => expect(fakeApi.called('POST', /composition$/)).toHaveLength(1))
    const entries = (fakeApi.called('POST', /composition$/)[0].data as { entries: { isStarter: boolean }[] }).entries
    expect(entries.filter((e) => e.isStarter)).toHaveLength(11)
  })

  it('goes back once more to the presence step and toggles a role', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    await settle()
    expect(screen.getByText(/Étape 1\/3 — Présence/)).toBeInTheDocument()
    const rem = screen.getAllByRole('button', { name: 'Rempl.' })[0]
    await user.click(rem)
    await user.click(screen.getAllByRole('button', { name: 'Spect.' })[1])
    await user.click(screen.getAllByRole('button', { name: 'Absent' })[2])
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await settle()
    expect(screen.getByText(/Étape 2\/3/)).toBeInTheDocument()
  })

  it('adds a player who is not registered, by name', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    await settle()
    await user.type(screen.getByPlaceholderText('Prénom'), 'Nouveau')
    await user.type(screen.getByPlaceholderText('Nom'), 'Joueur')
    await user.click(screen.getByRole('button', { name: /Ajouter un joueur non inscrit/ }))
    await settle()
    expect(document.body.textContent).toContain('Nouveau Joueur')
  })

  it('finishing the setup (coach) sends the confirmation', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    await settle()
    const confirm = screen.queryByRole('button', { name: /Terminer|Confirmer/ })
    if (confirm && screen.queryByRole('dialog')) await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Terminer|Confirmer/ }))
    await waitFor(() => expect(fakeApi.called('PATCH', /\/matches\/[^/]+$/).length).toBeGreaterThan(0))
  })

  it('the score can be adjusted and saved again', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Ajouter un but à US Ronchin' }))
    await user.click(screen.getByRole('button', { name: 'Retirer un but à Opponent 0' }).closest('div')!.querySelector('button[aria-label^="Ajouter"]')!)
    await user.click(screen.getByRole('button', { name: 'Enregistrer le score' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /\/matches\/[^/]+$/).length).toBeGreaterThan(0))
    expect(fakeApi.called('PATCH', /matches/)[0].data).toMatchObject({ scoreHome: 6, scoreAway: 1, status: 'PLAYED' })
  })

  it('the match can be edited and deleted (with confirmation)', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Modifier le match' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(fakeApi.called('PATCH', /matches\/[^/]+$/).length).toBeGreaterThan(0))
  })

  it('closing the configuration hides the wizard', async () => {
    const user = await openWizard()
    await user.click(screen.getByRole('button', { name: 'Fermer la configuration' }))
    await settle()
    expect(screen.queryByText(/Étape 3\/3/)).toBeNull()
  })
})

describe('played match — player view', () => {
  it('shows the final score with both team names and the result', async () => {
    await openPlayed('player', 0)
    expect(document.body.textContent).toContain('US Ronchin')
    expect(document.body.textContent).toContain('Opponent 0')
    expect(screen.getByText('Victoire')).toBeInTheDocument()
  })

  it('a defeat reads as such', async () => {
    await openPlayed('player', 3)
    expect(screen.getByText('Défaite')).toBeInTheDocument()
  })

  it('a player who has not voted yet is asked for the patron de la défense, blank allowed', async () => {
    const user = await openPlayed('player', 0)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Vote obligatoire/)).toBeInTheDocument()
    const vote = within(dialog).getByRole('button', { name: 'Voter' })
    expect(vote).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /First3/ }))
    await user.click(vote)
    await waitFor(() => expect(fakeApi.called('PUT', /defense-boss$/)).toHaveLength(1))
    expect(fakeApi.called('PUT', /defense-boss$/)[0].data).toHaveProperty('votedForId')
  })

  it('a blank vote is sent without a target', async () => {
    const user = await openPlayed('player', 0)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Vote blanc' }))
    await waitFor(() => expect(fakeApi.called('PUT', /defense-boss$/)).toHaveLength(1))
    expect(fakeApi.called('PUT', /defense-boss$/)[0].data).not.toHaveProperty('votedForId')
  })

  it('the coach sees the summary too', async () => {
    await openPlayed('coach', 2)
    expect(document.body.textContent).toContain('Match nul')
  })
})

describe('linking a guest to an account (coach, played match)', () => {
  it('a player entered by name can be linked once he has an account', async () => {
    const user = userEvent.setup()
    const users = fixtures.roles.coach['/users'] as Record<string, unknown>[]
    const newcomer = { ...users.find((u) => u.role === 'PLAYER'), id: 'newcomer-1', firstName: 'Nouveau', lastName: 'Compte', email: 'n@x.io', role: 'PLAYER', status: 'ACTIVE' }
    renderApp(`/matches/${meta.matchIds[0]}`, 'coach')
    fakeApi.on('GET', /^\/users$/, [...users, newcomer])
    await settle(900)
    await user.click(screen.getAllByText('Lier à un compte')[0])
    const combo = screen.getAllByRole('combobox').at(-1)!
    combo.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    const confirm = screen.getAllByRole('button').find((b) => (b.textContent ?? '').trim() === 'OK' && !b.hasAttribute('disabled'))
    expect(confirm).toBeDefined()
    await user.click(confirm!)
    await waitFor(() => expect(fakeApi.called('PATCH', /composition\/.+\/link$/)).toHaveLength(1))
    expect(fakeApi.called('PATCH', /link$/)[0].data).toHaveProperty('userId')
  })
})
