import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures, meta, type Role } from './fake-api'

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

describe('convocation — first announcement and formation change', () => {
  async function openFresh() {
    const user = userEvent.setup()
    const match = fixtures.roles.coach[`/matches/${meta.upcomingMatchId}`] as Record<string, unknown>
    const attendance = (fixtures.roles.coach[`/matches/${meta.upcomingMatchId}/attendance`] as Record<string, unknown>[]).map((a) => ({ ...a, called: false }))
    renderApp(`/matches/${meta.upcomingMatchId}`, 'coach')
    fakeApi.on('GET', new RegExp(`/matches/${meta.upcomingMatchId}$`), { ...match, convocationAnnouncedAt: null })
    fakeApi.on('GET', /attendance$/, attendance)
    fakeApi.on('GET', /lineup$/, { formation: null, slots: null, validatedAt: null })
    await settle(800)
    return user
  }

  it('nothing is announced yet: the lineup is locked and the convocation reads "À faire"', async () => {
    await openFresh()
    expect(screen.getByRole('button', { name: /^Composition de départ/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Convocation/ }).textContent).toContain('À faire')
  })

  it('selects players and announces for the first time after confirming', async () => {
    const user = await openFresh()
    await user.click(screen.getByRole('button', { name: /^Convocation/ }))
    const dialog = await screen.findByRole('dialog')
    const announce = within(dialog).getByRole('button', { name: 'Annoncer la convocation' })
    expect(announce).toBeDisabled() // nobody selected yet
    const rows = within(dialog).getAllByRole('button').filter((b) => /First\d+ Last\d+/.test(b.textContent ?? ''))
    for (const row of rows.slice(0, 11)) await user.click(row)
    await user.click(announce)
    await screen.findByText('Annoncer la convocation ?')
    await user.click(screen.getByRole('button', { name: 'Annoncer' }))
    await waitFor(() => expect(fakeApi.called('PUT', /convocation$/)).toHaveLength(1))
    expect((fakeApi.called('PUT', /convocation$/)[0].data as { calledUserIds: string[] }).calledUserIds).toHaveLength(11)
  })

  it('changing the system reflows the pitch and un-validates the lineup', async () => {
    const user = userEvent.setup()
    renderApp(`/matches/${meta.upcomingMatchId}`, 'coach')
    await settle(800)
    await user.click(screen.getByRole('button', { name: /^Composition de départ/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Composition validée/ })).toBeDisabled()
    within(dialog).getByRole('combobox').focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    const validate = within(dialog).getByRole('button', { name: 'Valider la composition' })
    expect(validate).toBeEnabled()
    await user.click(validate)
    await waitFor(() => expect(fakeApi.called('PUT', /lineup$/)).toHaveLength(1))
    expect((fakeApi.called('PUT', /lineup$/)[0].data as { formation: string }).formation).not.toBe('4-4-2 à plat')
  })

  it('a swap on the pitch is sent with the validation', async () => {
    const user = userEvent.setup()
    renderApp(`/matches/${meta.upcomingMatchId}`, 'coach')
    await settle(800)
    await user.click(screen.getByRole('button', { name: /^Composition de départ/ }))
    const dialog = await screen.findByRole('dialog')
    const pitch = dialog.querySelector('.aspect-\\[3\\/4\\]') as HTMLElement
    pitch.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} })
    const dots = [...dialog.querySelectorAll('button.touch-none')] as HTMLElement[]
    const before = dots.map((d) => d.title)
    fireEvent.pointerDown(dots[1], { pointerId: 1 })
    const target = dots[2].parentElement as HTMLElement
    fireEvent.pointerMove(pitch, { clientX: parseFloat(target.style.left), clientY: parseFloat(target.style.top) })
    fireEvent.pointerUp(pitch)
    await settle()
    const after = ([...dialog.querySelectorAll('button.touch-none')] as HTMLElement[]).map((d) => d.title)
    expect(after).not.toEqual(before)
  })
})
