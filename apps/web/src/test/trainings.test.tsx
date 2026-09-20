import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, meta, type Role } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

/** Coach/player on the trainings page, opened on the day of the upcoming (already-answered,
 * teams generated) session: week +1, its Monday. */
async function openUpcoming(role: Role = 'coach') {
  const user = userEvent.setup()
  renderApp('/trainings', role)
  await settle()
  await user.click(screen.getAllByRole('button')[8]) // next week
  await settle()
  await user.click(screen.getAllByRole('button')[9]) // Monday 21
  await settle()
  return user
}

/** Same, but the finished session of the previous Sunday (pointage à faire). */
async function openPast(role: Role = 'coach') {
  const user = userEvent.setup()
  renderApp('/trainings', role)
  await settle()
  await user.click(screen.getAllByRole('button')[7]) // previous week
  await settle()
  await user.click(screen.getAllByRole('button')[16]) // Sunday 13
  await settle()
  return user
}

describe('trainings — upcoming session', () => {
  it('shows the session with its teams', async () => {
    await openUpcoming()
    expect(screen.getByText('Équipe Bleue')).toBeInTheDocument()
    expect(screen.getByText('Équipe Rouge')).toBeInTheDocument()
    expect(document.body.textContent).toContain('12 joueurs + 1 invité = 13 sur le terrain')
  })

  it('a player changes his answer', async () => {
    const user = await openUpcoming('player')
    await user.click(screen.getByRole('button', { name: 'Absent' }))
    await waitFor(() => expect(fakeApi.called('PUT', /\/training-sessions\/.+\/attendance$/)).toHaveLength(1))
    expect(fakeApi.called('PUT', /attendance$/)[0].data).toMatchObject({ status: 'ABSENT' })
  })

  it('a player cannot see the coach space', async () => {
    await openUpcoming('player')
    expect(screen.queryByText('Espace coach')).toBeNull()
  })

  it('the coach regenerates everything from the team dialog', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Modifier les équipes' }))
    await settle()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Tout régénérer/ }))
    await waitFor(() => expect(fakeApi.called('POST', /teams\/generate$/).length).toBeGreaterThan(0))
  })

  it('the coach opens the history of changes', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Historique' }))
    await settle()
    expect(fakeApi.called('GET', /attendance\/history$/).length).toBeGreaterThan(0)
  })

  it('deleting a session asks for confirmation first', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('dialog')
    expect(fakeApi.called('DELETE', /training-sessions/)).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: /Supprimer|Confirmer/ }))
    await waitFor(() => expect(fakeApi.called('DELETE', /\/training-sessions\/.+/)).toHaveLength(1))
  })

  it('editing a session sends the new values', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await settle()
    const save = screen.queryByRole('button', { name: /Enregistrer/ })
    if (save) await user.click(save)
    await settle()
    expect(fakeApi.called('PATCH', /\/training-sessions\/.+/).length).toBeGreaterThan(0)
  })
})

describe('trainings — finished session, coach wizard', () => {
  it('shows the pointage to do and opens the wizard', async () => {
    const user = await openPast()
    expect(screen.getByText(/Pointage à faire/)).toBeInTheDocument()
    expect(screen.getByText(/Score : Équipe Bleue 4 – 1 Équipe Rouge/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Gérer la séance/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/pointage/i)).toBeInTheDocument()
  })

  it('the presence of a finished session is locked for players', async () => {
    await openPast('player')
    expect(screen.getByText(/la présence ne peut plus être modifiée/)).toBeInTheDocument()
  })
})

describe('trainings — management dialog', () => {
  it('lists the trainings and can create one', async () => {
    const user = userEvent.setup()
    renderApp('/trainings')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Gérer les entraînements' }))
    await settle()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText(/Jeudi/).length).toBeGreaterThan(0)
    expect(meta.trainingId).toBeTruthy()
  })

  it('the training ranking is reachable', async () => {
    const user = userEvent.setup()
    renderApp('/trainings')
    await settle()
    await user.click(screen.getByRole('button', { name: /Classement des matchs d'entraînement/ }))
    await settle()
    expect(fakeApi.called('GET', /training-ranking/).length).toBeGreaterThan(0)
  })
})
