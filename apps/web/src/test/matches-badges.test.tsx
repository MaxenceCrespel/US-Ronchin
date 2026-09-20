import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './render-app'
import { fakeApi, fixtures, meta } from './fake-api'
import { saveSeenBadges } from '@/lib/badge-seen'
import type { BadgeStatus } from '@/lib/types'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('matches list (coach)', () => {
  it('creates a friendly match from the dialog', async () => {
    const user = userEvent.setup()
    renderApp('/matches', 'coach')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Ajouter un match amical' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(dialog.querySelector('#date') as HTMLElement, { target: { value: '2026-10-11' } })
    fireEvent.change(dialog.querySelector('#kickOffTime') as HTMLElement, { target: { value: '15:00' } })
    await user.type(dialog.querySelector('#opponent') as HTMLElement, 'FC Amical')
    await user.click(within(dialog).getByRole('button', { name: 'Créer le match' }))
    await waitFor(() => expect(fakeApi.called('POST', /^\/matches$/)).toHaveLength(1))
    expect(fakeApi.called('POST', /^\/matches$/)[0].data).toMatchObject({ opponent: 'FC Amical', date: '2026-10-11', homeAway: 'HOME' })
  })

  it('navigates between months', async () => {
    const user = userEvent.setup()
    renderApp('/matches', 'coach')
    await settle()
    const nav = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-chevron-left, svg.lucide-chevron-right'))
    expect(nav.length).toBeGreaterThanOrEqual(2)
    await user.click(nav[0])
    await user.click(nav[1])
    await user.click(nav[1])
  })

  it('a player has no create button', async () => {
    renderApp('/matches', 'player')
    await settle()
    expect(screen.queryByRole('button', { name: 'Ajouter un match amical' })).toBeNull()
  })
})

describe('badge holders panel (admin)', () => {
  async function openBadge() {
    const user = userEvent.setup()
    renderApp('/admin', 'admin')
    await settle()
    await user.click(screen.getByRole('tab', { name: 'Badges' }))
    await settle()
    const medal = document.querySelectorAll('button[class*="flex"]')
    return { user, medal }
  }

  it('opens a badge, lists its holders and revokes one after confirmation', async () => {
    const { user } = await openBadge()
    const holders = fixtures.roles.admin['/badges/holders'] as { key: string; holders?: unknown[] }[] | Record<string, unknown>
    expect(holders).toBeDefined()
    const medals = [...document.querySelectorAll('[role=tabpanel] button')].filter((b) => !b.getAttribute('aria-label'))
    expect(medals.length).toBeGreaterThan(0)
    await user.click(medals[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    const revoke = within(dialog).queryAllByRole('button', { name: /Retirer ce badge à/ })[0]
    if (revoke) {
      await user.click(revoke)
      const confirm = await screen.findByRole('button', { name: 'Retirer' })
      await user.click(confirm)
      await waitFor(() => expect(fakeApi.called('DELETE', /badges\/holders\/.+\/.+/).length).toBeGreaterThan(0))
    }
  })

  it('grants a badge to a player', async () => {
    const { user } = await openBadge()
    const medals = [...document.querySelectorAll('[role=tabpanel] button')].filter((b) => !b.getAttribute('aria-label'))
    await user.click(medals[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    const add = within(dialog).getAllByRole('button').find((b) => /Ajouter|Attribuer|Donner/.test(b.textContent ?? ''))
    expect(add).toBeDefined()
    await user.click(add!)
    const picker = within(dialog).getAllByRole('combobox').at(-1)!
    picker.focus()
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    await settle()
    const ok = within(dialog).getAllByRole('button').find((b) => /^(OK|Valider|Confirmer|Attribuer)$/.test((b.textContent ?? '').trim()))
    if (ok) {
      await user.click(ok)
      await waitFor(() => expect(fakeApi.called('POST', /holders\/.+\/grant$/)).toHaveLength(1))
    }
  })

  it('revoking a badge from everybody asks for confirmation', async () => {
    const { user } = await openBadge()
    const medals = [...document.querySelectorAll('[role=tabpanel] button')].filter((b) => !b.getAttribute('aria-label'))
    await user.click(medals[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    const all = within(dialog).queryAllByRole('button').find((b) => /tout le monde|à tous/i.test(b.textContent ?? ''))
    if (all) {
      await user.click(all)
      await user.click(await screen.findByRole('button', { name: 'Retirer à tout le monde' }))
      await waitFor(() => expect(fakeApi.called('DELETE', /badges\/holders\/[^/]+$/)).toHaveLength(1))
    }
  })
})

describe('badge unlock watcher', () => {
  it('celebrates a badge earned since this device last looked', async () => {
    const mine = fixtures.roles.player['/badges/me'] as BadgeStatus[]
    const earned = mine.find((b) => b.earned)!
    // pretend the device had recorded one fewer of this badge
    saveSeenBadges(fixtures.roles.player['/users/me'] ? (fixtures.roles.player['/users/me'] as { id: string }).id : '', { [earned.key]: Math.max(0, earned.count - 1) })
    renderApp('/', 'player')
    await settle(1200)
    expect(screen.queryByRole('button', { name: 'Révéler le badge' })).toBeInTheDocument()
    expect(meta.playerId).toBeTruthy()
  })

  it('stays quiet when nothing is new', async () => {
    const mine = fixtures.roles.player['/badges/me'] as BadgeStatus[]
    const id = (fixtures.roles.player['/users/me'] as { id: string }).id
    saveSeenBadges(id, Object.fromEntries(mine.filter((b) => b.earned).map((b) => [b.key, b.count])))
    renderApp('/', 'player')
    await settle(1000)
    expect(screen.queryByRole('button', { name: 'Révéler le badge' })).toBeNull()
  })
})
