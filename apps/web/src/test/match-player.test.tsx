import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures, meta } from './fake-api'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const M0 = () => `/matches/${meta.matchIds[0]}`

/** The recorded state is "player has not voted for the defense boss yet": once the PUT
 * lands, the server would answer with a blank vote — mimic that so the flow moves on. */
function serverFollowsVote() {
  const boss = fixtures.roles.player[`${M0()}/defense-boss`] as object
  fakeApi.on('PUT', /defense-boss$/, () => {
    fakeApi.on('GET', /defense-boss$/, { ...boss, myVoteIsBlank: true })
    return {}
  })
}

describe('mandatory post-match steps (player)', () => {
  it('votes for the patron de la défense, then rates every teammate and submits', async () => {
    const user = userEvent.setup()
    renderApp(M0(), 'player')
    await settle(800)
    serverFollowsVote()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /First3/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Voter' }))
    await waitFor(() => expect(fakeApi.called('PUT', /defense-boss$/)).toHaveLength(1))

    await screen.findByText(/Notes obligatoires/)
    const sliders = screen.getAllByRole('slider', { name: 'Note du joueur' })
    expect(sliders.length).toBeGreaterThan(5)
    const submit = screen.getByRole('button', { name: 'Valider mes notes' })
    expect(submit).toBeDisabled() // every teammate must be rated first
    for (const slider of sliders) fireEvent.change(slider, { target: { value: '7.5' } })
    expect(submit).toBeEnabled()
    await user.click(submit)
    await waitFor(() => expect(fakeApi.called('POST', /ratings\/submit$/)).toHaveLength(1))
    const sent = fakeApi.called('POST', /ratings\/submit$/)[0].data as { ratings: { rating: number }[] }
    expect(sent.ratings).toHaveLength(sliders.length)
    expect(sent.ratings.every((r) => r.rating === 7.5)).toBe(true)
  })

  it('cannot skip the mandatory vote by closing the dialog', async () => {
    const user = userEvent.setup()
    renderApp(M0(), 'player')
    await settle(800)
    await user.keyboard('{Escape}')
    await settle()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('friendly match presence (+1 guests)', () => {
  it('a player answers and adds a guest on an upcoming friendly', async () => {
    const user = userEvent.setup()
    renderApp(`/matches/${meta.upcomingMatchId}`, 'player')
    await settle(800)
    await user.click(screen.getByRole('button', { name: 'Absent' }))
    await waitFor(() => expect(fakeApi.called('PUT', /matches\/.+\/attendance$/)).toHaveLength(1))
    expect(fakeApi.called('PUT', /attendance$/)[0].data).toMatchObject({ status: 'ABSENT' })
    await user.click(screen.getByRole('button', { name: 'Présent' }))
    await settle()
    await user.type(screen.getByPlaceholderText('Prénom'), 'Cousin')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(fakeApi.called('PUT', /attendance$/).length).toBeGreaterThan(1))
    const last = fakeApi.called('PUT', /attendance$/).at(-1)!.data as { guests: { firstName: string }[] }
    expect(last.guests.map((g) => g.firstName)).toContain('Cousin')
  })

  it('shows who is coming and the headcount', async () => {
    renderApp(`/matches/${meta.upcomingMatchId}`, 'player')
    await settle(800)
    expect(document.body.textContent).toMatch(/sur le terrain/)
  })
})

describe('coach deleting a match', () => {
  it('asks the browser to confirm, then deletes', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderApp(M0(), 'coach')
    await settle(800)
    await user.click(screen.getByRole('button', { name: 'Configurer le match' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Supprimer le match' }))
    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(fakeApi.called('DELETE', /^\/matches\/.+/)).toHaveLength(1))
    confirmSpy.mockRestore()
  })

  it('does nothing when the coach declines', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp(M0(), 'coach')
    await settle(800)
    await user.click(screen.getByRole('button', { name: 'Configurer le match' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Supprimer le match' }))
    expect(fakeApi.called('DELETE', /^\/matches\/.+/)).toHaveLength(0)
    confirmSpy.mockRestore()
  })
})
