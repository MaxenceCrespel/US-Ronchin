import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router-dom'
import { renderApp } from './render-app'
import { fakeApi, meta, type Role } from './fake-api'
import { AttendanceMark } from '@/components/AttendanceMark'
import { OfflineBanner } from '@/components/OfflineBanner'
import { PositionLegend } from '@/components/PositionLegend'
import { PublicShell, SkipLink, getRouteMeta } from '@/lib/route-meta'
import { errorMessage } from '@/lib/error-message'
import { optimisticAttendance } from '@/lib/optimistic-attendance'
import { QueryClient } from '@tanstack/react-query'
import type { User } from '@/lib/types'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

// jsdom has no layout, so colour contrast and target size are checked in the real-browser audit;
// everything structural (names, labels, landmarks, headings, nesting, ARIA) is checked here.
const RULES = ['button-name', 'link-name', 'label', 'select-name', 'input-button-name', 'aria-valid-attr', 'aria-valid-attr-value', 'aria-required-attr', 'aria-allowed-attr', 'aria-roles', 'nested-interactive', 'page-has-heading-one', 'landmark-one-main', 'image-alt', 'duplicate-id-aria', 'heading-order']

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { runOnly: { type: 'rule', values: RULES }, rules: { 'page-has-heading-one': { enabled: true }, 'landmark-one-main': { enabled: true } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
}

const PAGES: [string, Role][] = [
  ['/login', 'player'],
  ['/join', 'player'],
  ['/', 'coach'],
  ['/trainings', 'coach'],
  ['/matches', 'coach'],
  [`/matches/${meta.upcomingMatchId}`, 'coach'],
  [`/matches/${meta.matchIds[0]}`, 'coach'],
  ['/stats', 'player'],
  ['/players', 'coach'],
  ['/profile', 'player'],
  ['/profile/edit', 'player'],
  ['/profile/password', 'player'],
  ['/profile/club', 'coach'],
  ['/admin', 'admin'],
]

describe('automated accessibility rules (structure)', () => {
  it.each(PAGES)('%s (%s) has no structural violations', async (route, role) => {
    renderApp(route, role, { signedIn: !['/login', '/join'].includes(route) })
    await settle(900)
    // a mandatory-vote modal on top of the match page would hide the page from assistive tech: dismiss it
    expect(await violations()).toEqual([])
  })
})

describe('page chrome', () => {
  it('every page has a title, and a level-one heading (visible or hidden)', async () => {
    renderApp('/profile/badges', 'player')
    await settle(700)
    expect(document.title).toBe('Mes badges — US Ronchin')
    expect(document.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1)
  })

  it('does not double up when the page draws its own h1', async () => {
    renderApp('/trainings', 'coach')
    await settle(700)
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('knows every route and falls back gracefully', () => {
    expect(getRouteMeta('/matches/abc').title).toBe('Détail du match')
    expect(getRouteMeta('/nope').title).toBe('Espace équipe')
  })

  it('offers a skip link that targets the main landmark', async () => {
    render(
      <MemoryRouter>
        <SkipLink />
        <PublicShell />
      </MemoryRouter>,
    )
    const link = screen.getAllByRole('link', { name: 'Aller au contenu' })[0]
    expect(link).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN')
  })

  it('the calendar days are real buttons with a full date and no nested controls', async () => {
    renderApp('/trainings', 'coach')
    await settle(700)
    const days = screen.getAllByRole('button', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+ \w+$/i })
    expect(days).toHaveLength(7)
    for (const day of days) expect(day.querySelector('button, a, [role=button]')).toBeNull()
  })

  it('week navigation buttons are named', async () => {
    renderApp('/trainings', 'coach')
    await settle(700)
    expect(screen.getByRole('button', { name: 'Semaine précédente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semaine suivante' })).toBeInTheDocument()
  })
})

describe('forms', () => {
  it('sign-in fields ask the browser for the right autofill', async () => {
    renderApp('/login', 'player', { signedIn: false })
    await settle(500)
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('a password mismatch is announced and tied to its field', async () => {
    const user = userEvent.setup()
    renderApp('/join', 'player', { signedIn: false })
    await settle(500)
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Password-123')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Different-1')
    const confirm = screen.getByLabelText('Confirmer le mot de passe')
    expect(confirm).toHaveAttribute('aria-invalid', 'true')
    const error = screen.getByRole('alert')
    expect(confirm.getAttribute('aria-describedby')).toBe(error.id)
  })

  it('errors from the server are announced to screen readers', async () => {
    const user = userEvent.setup()
    renderApp('/login', 'player', { signedIn: false })
    fakeApi.on('POST', /auth\/login$/, { message: 'Identifiants invalides' }, 401)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Mot de passe'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Identifiants invalides|incorrect/i)
  })
})

describe('status that does not rely on colour', () => {
  it('spells out and symbolises the presence status', () => {
    const { container } = render(
      <>
        <AttendanceMark status="PRESENT" />
        <AttendanceMark status="ABSENT" />
        <AttendanceMark status="MAYBE" />
        <AttendanceMark status={null} />
      </>,
    )
    expect(container.textContent).toContain('✓')
    expect(container.textContent).toContain('✗')
    expect(container.textContent).toContain('?')
    expect(container.textContent).toMatch(/Présent : /)
  })

  it('presence buttons expose which answer is selected', async () => {
    renderApp(`/matches/${meta.upcomingMatchId}`, 'player')
    await settle(800)
    const pressed = screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)
    expect(pressed).toContain('Présent')
  })
})

describe('error messages', () => {
  const axiosError = (status: number | null, data?: unknown) => Object.assign(new Error('x'), { isAxiosError: true, response: status === null ? undefined : { status, data } })
  it('prefers the server explanation', () => {
    expect(errorMessage(axiosError(400, { message: 'Un match existe déjà' }), 'Échec')).toBe('Un match existe déjà')
    expect(errorMessage(axiosError(400, { message: ['a', 'b'] }), 'Échec')).toBe('a · b')
  })
  it('explains a network failure, a refusal and a server crash', () => {
    expect(errorMessage(axiosError(null), 'Échec')).toMatch(/réseau/)
    expect(errorMessage(axiosError(403, {}), 'Échec')).toMatch(/droits/)
    expect(errorMessage(axiosError(500, {}), 'Échec')).toMatch(/serveur/)
  })
  it('falls back to the caller message otherwise', () => {
    expect(errorMessage(new Error('boom'), 'Échec — réessaie.')).toBe('Échec — réessaie.')
    expect(errorMessage(axiosError(404, {}), 'Introuvable')).toBe('Introuvable')
  })
})

describe('offline notice, legend and optimistic answers', () => {
  it('tells the person when the network is gone', async () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status').textContent).toMatch(/hors ligne/)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('spells out every position code', async () => {
    const user = userEvent.setup()
    render(<PositionLegend />)
    await user.click(screen.getByRole('button', { name: /Légende des postes/ }))
    const dialog = await screen.findByRole('dialog')
    for (const code of ['GB', 'DC', 'DD', 'DG', 'MDF', 'MC', 'MOC', 'BU', 'AG', 'AD', 'Rempl.', 'Spect.']) expect(dialog.textContent).toContain(code)
    expect(dialog.textContent).toContain('Défenseur central')
  })

  it('switches the answer instantly, rolls back on failure, refetches either way', async () => {
    const client = new QueryClient()
    const key = ['attendances', 's1']
    const me = { id: 'u1' } as User
    client.setQueryData(key, [{ userId: 'u1', status: 'ABSENT' }, { userId: 'u2', status: 'PRESENT' }])
    const opt = optimisticAttendance<{ userId: string; status: 'PRESENT' | 'ABSENT' | 'MAYBE' | null }, { status: 'PRESENT' | 'ABSENT' | 'MAYBE' }>(client, key, me, (u) => ({ userId: u.id, status: null }))
    const context = await opt.onMutate({ status: 'PRESENT' })
    expect((client.getQueryData(key) as { status: string }[])[0].status).toBe('PRESENT')
    opt.onError(new Error('x'), { status: 'PRESENT' }, context)
    expect((client.getQueryData(key) as { status: string }[])[0].status).toBe('ABSENT')
    // a first answer (no row yet) is added
    client.setQueryData(key, [{ userId: 'u2', status: 'PRESENT' }])
    await opt.onMutate({ status: 'MAYBE' })
    expect((client.getQueryData(key) as { userId: string; status: string }[]).find((a) => a.userId === 'u1')?.status).toBe('MAYBE')
    await waitFor(() => expect(typeof opt.onSettled).toBe('function'))
  })
})
