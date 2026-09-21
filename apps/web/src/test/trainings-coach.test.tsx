import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { openDay as openCalendarDay, pastSessionDate, upcomingSessionDate } from './calendar'
import { fakeApi, fixtures, meta } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const btn = (root: HTMLElement | Document, re: RegExp) =>
  [...root.querySelectorAll('button')].find((b) => re.test((b.textContent ?? '').trim())) as HTMLElement | undefined

async function openDay(week: 'next' | 'prev', before?: () => void) {
  const user = userEvent.setup()
  renderApp('/trainings', 'coach')
  before?.()
  await settle()
  await openCalendarDay(user, week === 'next' ? upcomingSessionDate() : pastSessionDate())
  return user
}
const openUpcoming = (before?: () => void) => openDay('next', before)
const openPast = () => openDay('prev')

describe('team adjustment dialog', () => {
  it('moves a player to the other team', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Modifier les équipes' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: /Déplacer dans l'autre équipe/ })[0])
    await waitFor(() => expect(fakeApi.called('PATCH', /teams$/)).toHaveLength(1))
    expect(fakeApi.called('PATCH', /teams$/)[0].data).toHaveProperty('teamIndex')
  })

  it('removes a player who finally did not come — after confirming', async () => {
    const user = await openUpcoming()
    await user.click(screen.getByRole('button', { name: 'Modifier les équipes' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: /Ne vient finalement pas/ })[0])
    await settle()
    expect(fakeApi.called('DELETE', /teams\/.+/)).toHaveLength(0)
    const confirm = screen.getAllByRole('dialog').at(-1)!
    await user.click(within(confirm).getByRole('button', { name: /Retirer|Confirmer|Supprimer/ }))
    await waitFor(() => expect(fakeApi.called('DELETE', /teams\/.+/)).toHaveLength(1))
  })

  it('a player dropped from the teams shows up under the other roster players and can be re-added', async () => {
    const user = await openUpcoming(() => {
      const teams = (fixtures.roles.coach[`/training-sessions/${meta.upcomingSessionId}/teams`] as { id: string }[]).slice(1)
      fakeApi.on('GET', /training-sessions\/.+\/teams$/, teams)
    })
    await user.click(screen.getByRole('button', { name: 'Modifier les équipes' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Autres joueurs du roster')
    await user.click(within(dialog).getByRole('button', { name: /Marquer présent et ajouter à l'équipe/ }))
    await waitFor(() => expect(fakeApi.called('POST', /teams\/add-player$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /add-player$/)[0].data).toHaveProperty('userId')
  })

  it('marks a non-assigned roster player absent', async () => {
    const user = await openUpcoming(() => {
      const teams = (fixtures.roles.coach[`/training-sessions/${meta.upcomingSessionId}/teams`] as { id: string }[]).slice(1)
      fakeApi.on('GET', /training-sessions\/.+\/teams$/, teams)
    })
    await user.click(screen.getByRole('button', { name: 'Modifier les équipes' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Marquer absent/ }))
    await waitFor(() => expect(fakeApi.called('PUT', /attendance\/.+/).length).toBeGreaterThan(0))
    expect(fakeApi.called('PUT', /attendance\/.+/)[0].data).toMatchObject({ status: 'ABSENT' })
  })
})

describe('session without teams', () => {
  it('offers to generate them', async () => {
    const user = await openUpcoming(() => fakeApi.on('GET', /training-sessions\/.+\/teams$/, []))
    const generate = screen.getByRole('button', { name: /Générer les équipes/ })
    await user.click(generate)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Générer maintenant/ }))
    await waitFor(() => expect(fakeApi.called('POST', /teams\/generate$/).length).toBeGreaterThan(0))
  })
})

describe('finished session wizard', () => {
  it('pointage: mark one present, one absent, or everybody at once', async () => {
    const user = await openPast()
    await user.click(screen.getByRole('button', { name: /Gérer la séance/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: 'Marquer présent' })[0])
    await waitFor(() => expect(fakeApi.called('PUT', /attendance\/.+\/actual$/)).toHaveLength(1))
    expect(fakeApi.called('PUT', /actual$/)[0].data).toMatchObject({ status: 'PRESENT' })
    await user.click(within(dialog).getAllByRole('button', { name: 'Marquer absent' })[1])
    await waitFor(() => expect(fakeApi.called('PUT', /actual$/)).toHaveLength(2))
    await user.click(within(dialog).getByRole('button', { name: /Tout présent/ }))
    await waitFor(() => expect(fakeApi.called('PUT', /actual$/).length).toBeGreaterThan(2))
  })

  it('shows the three steps and lets the coach close the wizard', async () => {
    const user = await openPast()
    await user.click(screen.getByRole('button', { name: /Gérer la séance/ }))
    const dialog = await screen.findByRole('dialog')
    for (const step of ['Pointage', 'Équipes', 'Score']) expect(dialog.textContent).toContain(step)
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    await settle()
    expect(screen.queryByText('Pointage✓Équipes✓Score')).toBeNull()
  })
})

describe('training management', () => {
  it('creates a recurring training', async () => {
    const user = userEvent.setup()
    renderApp('/trainings', 'coach')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Gérer les entraînements' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(dialog.querySelector('#title') as HTMLElement, 'Vendredi soir')
    await user.type(dialog.querySelector('#location') as HTMLElement, 'Terrain B')
    fireEvent.change(dialog.querySelector('#startTime') as HTMLElement, { target: { value: '19:00' } })
    fireEvent.change(dialog.querySelector('#endTime') as HTMLElement, { target: { value: '20:30' } })
    fireEvent.change(dialog.querySelector('#startDate') as HTMLElement, { target: { value: '2026-10-02' } })
    await user.click(within(dialog).getByRole('button', { name: "Créer l'entraînement" }))
    await waitFor(() => expect(fakeApi.called('POST', /^\/trainings$/).length).toBeGreaterThan(0))
    expect(fakeApi.called('POST', /^\/trainings$/)[0].data).toMatchObject({ title: 'Vendredi soir', location: 'Terrain B', type: 'RECURRING' })
  })

  it('edits and deletes an existing training', async () => {
    const user = userEvent.setup()
    renderApp('/trainings', 'coach')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Gérer les entraînements' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: 'Modifier' })[0])
    await settle()
    const save = btn(screen.getAllByRole('dialog').at(-1) as HTMLElement, /Enregistrer/)
    if (save) {
      await user.click(save)
      await waitFor(() => expect(fakeApi.called('PATCH', /^\/trainings\/.+/).length).toBeGreaterThan(0))
    }
  })

  it('deleting a training asks for confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/trainings', 'coach')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Gérer les entraînements' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button', { name: 'Supprimer' })[0])
    await settle()
    expect(fakeApi.called('DELETE', /^\/trainings\//)).toHaveLength(0)
    const confirm = screen.getAllByRole('dialog').at(-1)!
    await user.click(within(confirm).getByRole('button', { name: /Supprimer|Confirmer/ }))
    await waitFor(() => expect(fakeApi.called('DELETE', /^\/trainings\/.+/)).toHaveLength(1))
  })
})

describe('special session states', () => {
  it('a cancelled session says so and cannot be answered', async () => {
    const sessions = fixtures.roles.coach['/training-sessions'] as Record<string, unknown>[]
    await openUpcoming(() => {
      fakeApi.on(
        'GET',
        /^\/training-sessions$/,
        sessions.map((s) => (s.id === meta.upcomingSessionId ? { ...s, cancelled: true } : s)),
      )
    })
    expect(document.body.textContent).toMatch(/Annulée/)
  })

  it('creates a one-off training with a date', async () => {
    const user = userEvent.setup()
    renderApp('/trainings', 'coach')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Gérer les entraînements' }))
    const dialog = await screen.findByRole('dialog')
    within(dialog).getAllByRole('combobox')[0].focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    await user.type(dialog.querySelector('#title') as HTMLElement, 'Match interne')
    await user.type(dialog.querySelector('#location') as HTMLElement, 'Gymnase')
    fireEvent.change(dialog.querySelector('#startTime') as HTMLElement, { target: { value: '18:00' } })
    fireEvent.change(dialog.querySelector('#endTime') as HTMLElement, { target: { value: '19:30' } })
    fireEvent.change(dialog.querySelector('#startDate') as HTMLElement, { target: { value: '2026-11-05' } })
    await user.click(within(dialog).getByRole('button', { name: "Créer l'entraînement" }))
    await waitFor(() => expect(fakeApi.called('POST', /^\/trainings$/).length).toBeGreaterThan(0))
    expect(fakeApi.called('POST', /^\/trainings$/)[0].data).toMatchObject({ title: 'Match interne', type: 'ONE_OFF' })
  })
})
