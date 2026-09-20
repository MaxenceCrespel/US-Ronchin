import { describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures } from './fake-api'
import { useAuthStore } from '@/lib/auth-store'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const me = fixtures.roles.player['/users/me']

describe('login', () => {
  it('signs in and lands on the home page', async () => {
    const user = userEvent.setup()
    renderApp('/login', 'player', { signedIn: false })
    fakeApi.on('POST', /auth\/login$/, { accessToken: 'a', refreshToken: 'r' })
    fakeApi.on('GET', /users\/me$/, me)
    await user.type(screen.getByLabelText('Email'), 'me@test.local')
    await user.type(screen.getByLabelText('Mot de passe'), 'Password-123')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    await waitFor(() => expect(fakeApi.called('POST', /auth\/login$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /auth\/login$/)[0].data).toEqual({ email: 'me@test.local', password: 'Password-123' })
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('a'))
  })

  it('shows an error on wrong credentials and stays signed out', async () => {
    const user = userEvent.setup()
    renderApp('/login', 'player', { signedIn: false })
    fakeApi.on('POST', /auth\/login$/, { message: 'Identifiants invalides' }, 401)
    await user.type(screen.getByLabelText('Email'), 'me@test.local')
    await user.type(screen.getByLabelText('Mot de passe'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByText(/Identifiants invalides|incorrect|Échec/i)).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('links to the sign-up page', async () => {
    renderApp('/login', 'player', { signedIn: false })
    await settle()
    expect(document.body.textContent).toMatch(/Créer mon compte/)
  })
})

describe('protected routes', () => {
  it('sends a signed-out visitor to the login page', async () => {
    renderApp('/matches', 'player', { signedIn: false })
    await settle()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('keeps a player out of coach-only pages', async () => {
    const coach = renderApp('/admin/import-pdf', 'coach')
    await settle()
    expect(document.body.textContent).toMatch(/Importer une feuille de match FFF/)
    coach.unmount()
    renderApp('/admin/import-pdf', 'player')
    await settle()
    expect(document.body.textContent).not.toMatch(/Importer une feuille de match FFF/)
  })

  it('keeps a coach out of the admin dashboard', async () => {
    const admin = renderApp('/admin', 'admin')
    await settle()
    expect(document.body.textContent).toMatch(/Tableau de bord/)
    admin.unmount()
    renderApp('/admin', 'coach')
    await settle()
    expect(document.body.textContent).not.toMatch(/Actifs cette semaine/)
  })
})

describe('sign-up', () => {
  it('validates that passwords match, then creates a pending account', async () => {
    const user = userEvent.setup()
    renderApp('/join', 'player', { signedIn: false })
    await user.type(screen.getByLabelText('Prénom'), 'Nouveau')
    await user.type(screen.getByLabelText('Nom'), 'Joueur')
    await user.type(screen.getByLabelText('Email'), 'nouveau@test.local')
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Password-123')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Different-123')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }))
    await settle()
    expect(fakeApi.called('POST', /auth\/join$/)).toHaveLength(0)

    await user.clear(screen.getByLabelText('Confirmer le mot de passe'))
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password-123')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }))
    await waitFor(() => expect(fakeApi.called('POST', /auth\/join$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /auth\/join$/)[0].data).toMatchObject({ email: 'nouveau@test.local', firstName: 'Nouveau' })
  })

  it('the waiting page reflects the approval status', async () => {
    fakeApi.install('player')
    renderApp('/join/waiting?email=x%40test.local', 'player', { signedIn: false })
    fakeApi.on('GET', /join-status/, { status: 'PENDING' })
    await settle(700)
    expect(document.body.textContent).toMatch(/attente|validation/i)
  })

  it('the waiting page offers to sign in once approved', async () => {
    renderApp('/join/waiting?email=x%40test.local', 'player', { signedIn: false })
    fakeApi.on('GET', /join-status/, { status: 'ACTIVE' })
    await settle(700)
    expect(document.body.textContent).toMatch(/Se connecter|validé|activé/i)
  })
})

describe('accept invitation', () => {
  it('sets the password from an invitation link', async () => {
    const user = userEvent.setup()
    renderApp('/accept-invitation?token=tok-1', 'player', { signedIn: false })
    fakeApi.on('POST', /accept-invitation$/, { accessToken: 'a', refreshToken: 'r' })
    fakeApi.on('GET', /users\/me$/, me)
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Password-123')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password-123')
    await user.click(screen.getByRole('button', { name: /Créer|Valider|Continuer|Définir|Activer/ }))
    await waitFor(() => expect(fakeApi.called('POST', /accept-invitation$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /accept-invitation$/)[0].data).toMatchObject({ token: 'tok-1', password: 'Password-123' })
  })
})
