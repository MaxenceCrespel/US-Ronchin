import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, meta, type Role } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

async function open(role: Role = 'coach') {
  const user = userEvent.setup()
  renderApp(`/matches/${meta.upcomingMatchId}`, role)
  await settle()
  return user
}

describe('convocation (coach)', () => {
  it('summarises where the convocation and the lineup stand', async () => {
    await open()
    expect(screen.getByText('Convocation et composition')).toBeInTheDocument()
    expect(screen.getByText('12 convoqués')).toBeInTheDocument()
    expect(screen.getByText(/Validée · 4-4-2 à plat/)).toBeInTheDocument()
  })

  it('withdrawing a player only becomes possible through an explicit confirmed update', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Convocation/ }))
    const dialog = await screen.findByRole('dialog')
    const done = within(dialog).getByRole('button', { name: /Convocation annoncée/ })
    expect(done).toBeDisabled()

    // uncheck the first player
    await user.click(within(dialog).getAllByRole('button').find((b) => /First\d+ Last\d+/.test(b.textContent ?? ''))!)
    const update = within(dialog).getByRole('button', { name: /Mettre à jour la convocation \(1\)/ })
    await user.click(update)
    const confirm = await screen.findByText('Mettre à jour la convocation ?')
    expect(fakeApi.called('PUT', /convocation$/)).toHaveLength(0)
    expect(confirm).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))
    await waitFor(() => expect(fakeApi.called('PUT', /convocation$/)).toHaveLength(1))
    const sent = fakeApi.called('PUT', /convocation$/)[0].data as { calledUserIds: string[] }
    expect(sent.calledUserIds).toHaveLength(11)
  })

  it('cancelling the confirmation sends nothing', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Convocation/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('button').find((b) => /First\d+ Last\d+/.test(b.textContent ?? ''))!)
    await user.click(within(dialog).getByRole('button', { name: /Mettre à jour la convocation/ }))
    await user.click(await screen.findByRole('button', { name: 'Annuler' }))
    await settle()
    expect(fakeApi.called('PUT', /convocation$/)).toHaveLength(0)
  })

  it('lineup: the bench player highlights compatible slots and can be swapped in', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Composition de départ/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Système de jeu')).toBeInTheDocument()
    expect(within(dialog).getByText(/Remplaçants \(1\)/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Composition validée/ })).toBeDisabled()

    const bench = within(dialog).getAllByRole('button').find((b) => /First\d+ Last\d+/.test(b.textContent ?? '') && !b.title)!
    await user.click(bench)
    expect(dialog.textContent).toMatch(/joue .*poste/)

    // tapping a pitch player substitutes him and invalidates the validation
    const pitchPlayer = dialog.querySelector('.touch-none') as HTMLElement
    await user.pointer({ keys: '[MouseLeft>]', target: pitchPlayer })
    await settle()
    const validate = within(dialog).getByRole('button', { name: 'Valider la composition' })
    await user.click(validate)
    await waitFor(() => expect(fakeApi.called('PUT', /lineup$/)).toHaveLength(1))
    const sent = fakeApi.called('PUT', /lineup$/)[0].data as { formation: string; slots: string[]; validate: boolean }
    expect(sent.validate).toBe(true)
    expect(sent.slots).toHaveLength(11)
  })

  it('lineup: touching the selected bench player again deselects him', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Composition de départ/ }))
    const dialog = await screen.findByRole('dialog')
    const bench = within(dialog).getAllByRole('button').find((b) => /First\d+ Last\d+/.test(b.textContent ?? '') && !b.title)!
    await user.click(bench)
    await user.click(bench)
    expect(within(dialog).queryByText(/joue /)).toBeNull()
  })
})

describe('convocation (player view)', () => {
  it('a called player sees the confirmation banner, the coach card is hidden', async () => {
    await open('player')
    expect(screen.queryByText('Convocation et composition')).toBeNull()
    expect(document.body.textContent).toMatch(/Tu es convoqué|Tu n'es pas retenu/)
  })
})
