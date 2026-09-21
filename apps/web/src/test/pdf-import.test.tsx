import { describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures } from './fake-api'

const settle = (ms = 400) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const users = fixtures.roles.coach['/users'] as { id: string; firstName: string; lastName: string }[]
const p1 = users.find((u) => u.firstName === 'First3')!
const p2 = users.find((u) => u.firstName === 'First4')!

const SHEET = {
  matchInfo: {
    fffMatchId: '12345678',
    date: '2026-09-06',
    kickOffTime: '15:00',
    competition: 'D6 Poule A',
    venue: 'STADE DES TESTS',
    opponent: 'FC ADVERSE',
    homeAway: 'HOME',
    scoreHome: 3,
    scoreAway: 1,
  },
  composition: [
    { pdfName: 'THIERRY Raphael', licenseNumber: '1', jerseyNumber: 1, isStarter: true, matchedUserId: p1.id },
    { pdfName: 'INCONNU Total', licenseNumber: '2', jerseyNumber: 2, isStarter: true, matchedUserId: null },
    { pdfName: 'REMPLAÇANT Un', licenseNumber: '3', jerseyNumber: 12, isStarter: false, matchedUserId: p2.id },
  ],
  goals: [
    { minute: 12, playerPdfName: 'THIERRY Raphael', matchedUserId: p1.id, assistPdfName: 'REMPLAÇANT Un', assistMatchedUserId: p2.id, goalType: 'FOOT' },
    { minute: 40, playerPdfName: 'INCONNU Total', matchedUserId: null, assistPdfName: null, assistMatchedUserId: null, goalType: null },
  ],
  cards: [{ minute: 55, playerPdfName: 'THIERRY Raphael', matchedUserId: p1.id, type: 'YELLOW_CARD', needsReview: true }],
}

async function upload() {
  const user = userEvent.setup()
  renderApp('/admin/import-pdf', 'coach')
  await settle()
  fakeApi.on('POST', /matches\/pdf-import$/, SHEET)
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await user.upload(input, new File(['%PDF'], 'sheet.pdf', { type: 'application/pdf' }))
  await settle(600)
  return user
}

describe('match sheet import page', () => {
  it('starts with just the upload zone', async () => {
    renderApp('/admin/import-pdf', 'coach')
    await settle()
    expect(screen.getByText('Fichier PDF')).toBeInTheDocument()
    expect(screen.queryByText('Informations du match')).toBeNull()
  })

  it('shows what was detected: match info, lineup, goals and cards', async () => {
    await upload()
    expect(screen.getByText('Informations du match')).toBeInTheDocument()
    expect(screen.getByDisplayValue('FC ADVERSE')).toBeInTheDocument()
    expect(screen.getByDisplayValue('STADE DES TESTS')).toBeInTheDocument()
    expect(screen.getByText('Composition détectée')).toBeInTheDocument()
    expect(screen.getByText('Buts détectés')).toBeInTheDocument()
    expect(screen.getByText('Cartons détectés')).toBeInTheDocument()
    expect(document.body.textContent).toContain('THIERRY Raphael')
  })

  it('lets the coach correct the opponent before importing', async () => {
    const user = await upload()
    const opponent = screen.getByLabelText(/Adversaire/)
    await user.clear(opponent)
    await user.type(opponent, 'FC Corrigé')
    expect(screen.getByDisplayValue('FC Corrigé')).toBeInTheDocument()
  })

  it('creates the match, its lineup and its events on confirmation', async () => {
    fakeApi.install('coach')
    const user = await upload()
    fakeApi.on('GET', /^\/matches$/, [])
    fakeApi.on('POST', /^\/matches$/, { id: 'new-match' })
    await user.click(screen.getByRole('button', { name: /Confirmer l'import/ }))
    await waitFor(() => expect(fakeApi.called('POST', /^\/matches$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /^\/matches$/)[0].data).toMatchObject({ opponent: 'FC ADVERSE', source: 'OFFICIAL_FFF', fffMatchId: '12345678' })
    await waitFor(() => expect(fakeApi.called('POST', /new-match\/composition$/)).toHaveLength(1))
    await waitFor(() => expect(fakeApi.called('POST', /new-match\/events$/).length).toBeGreaterThan(0))
    const goals = fakeApi.called('POST', /new-match\/events$/).filter((c) => (c.data as { type: string }).type === 'GOAL')
    expect(goals).toHaveLength(1) // the second goal has no matched scorer and is skipped
  })

  it('updates the existing match instead of duplicating it and clears old events first', async () => {
    const user = await upload()
    fakeApi.on('GET', /^\/matches$/, [{ id: 'existing', fffMatchId: '12345678' }])
    fakeApi.on('PATCH', /matches\/existing$/, { id: 'existing' })
    fakeApi.on('GET', /matches\/existing\/events$/, [{ id: 'old-1' }, { id: 'old-2' }])
    await user.click(screen.getByRole('button', { name: /Confirmer l'import/ }))
    await waitFor(() => expect(fakeApi.called('PATCH', /matches\/existing$/).length).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(fakeApi.called('DELETE', /events\/old-/)).toHaveLength(2))
    expect(fakeApi.called('POST', /^\/matches$/)).toHaveLength(0)
  })

  it('reports a failed import', async () => {
    const user = await upload()
    fakeApi.on('GET', /^\/matches$/, [])
    fakeApi.on('POST', /^\/matches$/, { message: 'Un match existe déjà à cette date' }, 400)
    await user.click(screen.getByRole('button', { name: /Confirmer l'import/ }))
    // the server's own explanation is shown, not a generic "réessaie"
    expect(await screen.findByText('Un match existe déjà à cette date')).toBeInTheDocument()
  })

  it('reports an unreadable PDF', async () => {
    const user = userEvent.setup()
    renderApp('/admin/import-pdf', 'coach')
    await settle()
    fakeApi.on('POST', /matches\/pdf-import$/, { message: 'PDF illisible' }, 400)
    await user.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'bad.pdf', { type: 'application/pdf' }))
    await settle(600)
    expect(screen.queryByText('Informations du match')).toBeNull()
  })
})
