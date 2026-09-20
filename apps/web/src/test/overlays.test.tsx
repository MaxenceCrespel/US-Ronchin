import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BadgePackReveal } from '@/components/BadgePackReveal'
import { MonthlyTrophyReveal } from '@/features/awards/MonthlyTrophyReveal'
import { MatchTrophyReveal } from '@/features/matches/MatchTrophyReveal'
import { useVotePopupDismissedStore } from '@/lib/vote-popup-dismissed'
import { renderApp } from './render-app'
import { fakeApi } from './fake-api'
import type { BadgeStatus } from '@/lib/types'

const settle = (ms = 500) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

const badge = (rarity: BadgeStatus['rarity'], over: Partial<BadgeStatus> = {}): BadgeStatus => ({
  key: `b-${rarity}`,
  category: 'MATCH' as BadgeStatus['category'],
  rarity,
  title: `Badge ${rarity}`,
  description: 'Une belle performance',
  emoji: '🏅',
  earned: true,
  earnedAt: new Date().toISOString(),
  count: 1,
  progress: null,
  ...over,
})

describe('badge pack reveal', () => {
  it('needs a tap to open, then celebrates and can be closed', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<BadgePackReveal queue={[badge('COMMON')]} onDone={onDone} />)
    expect(screen.getByText(/Touche pour révéler/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Révéler le badge' }))
    expect(await screen.findByText(/Badge débloqué/, undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Badge COMMON')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Génial !' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it.each(['RARE', 'EPIC', 'LEGENDARY'] as const)('a %s badge reveals with its own rarity label', async (rarity) => {
    const user = userEvent.setup()
    render(<BadgePackReveal queue={[badge(rarity)]} onDone={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Révéler le badge' }))
    expect(await screen.findByText(/Badge débloqué/, undefined, { timeout: 4000 })).toBeInTheDocument()
  })

  it('walks a queue of several badges and shows the repeat count', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<BadgePackReveal queue={[badge('COMMON', { count: 3 }), badge('RARE')]} onDone={onDone} />)
    await user.click(screen.getByRole('button', { name: 'Révéler le badge' }))
    await screen.findByText(/×3/, undefined, { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: 'Badge suivant' }))
    expect(onDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Révéler le badge' }))
    await user.click(await screen.findByRole('button', { name: 'Génial !' }, { timeout: 3000 }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for an empty queue', () => {
    const { container } = render(<BadgePackReveal queue={[]} onDone={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('trophy reveals', () => {
  const win = (i: number) => ({
    id: `w${i}`,
    categoryKey: 'player_of_month',
    month: '2026-09',
    label: 'Joueur du mois',
    period: 'SEPTEMBRE 2026',
    headline: `Félicitations Joueur ${i} !`,
    subtitle: 'Joueur du mois — Septembre 2026',
    showBetterLuckNote: i === 2,
  })

  it('monthly: reveals the winner and advances through the queue', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<MonthlyTrophyReveal queue={[win(1), win(2)]} onDone={onDone} />)
    expect(await screen.findByText(/Félicitations Joueur 1/, undefined, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button').at(-1)!)
    expect(await screen.findByText(/Félicitations Joueur 2/, undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/prochaine fois/i)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button').at(-1)!)
    expect(onDone).toHaveBeenCalled()
  })

  it('match trophy: shows the headline and closes', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(
      <MatchTrophyReveal
        queue={[{ id: 'm1', kind: 'motm', headline: 'Félicitations Maxence !', subtitle: 'Homme du match — US Ronchin 4 - 0 Opponent', showBetterLuckNote: false }]}
        onDone={onDone}
      />,
    )
    expect(await screen.findByText(/Félicitations Maxence/, undefined, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button').at(-1)!)
    expect(onDone).toHaveBeenCalled()
  })
})

describe('mandatory season vote', () => {
  const category = (id: string, title: string) => ({
    id,
    key: id,
    title,
    season: '2026-2027',
    isActive: true,
    closedAt: null,
    createdAt: new Date().toISOString(),
    myVoteUserId: null,
    totalVotes: 0,
    results: null,
  })

  async function open() {
    useVotePopupDismissedStore.getState().reopen()
    const user = userEvent.setup()
    renderApp('/', 'player')
    fakeApi.on('GET', /^\/awards\/categories$/, [category('c1', 'MVP de la saison'), category('c2', 'Fair-play')])
    await settle(900)
    return user
  }

  it('walks the intro, one pick per trophy, the review and sends every vote', async () => {
    const user = await open()
    expect(screen.getByText(/2 trophées à décerner/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    await user.click(await screen.findByRole('button', { name: /First3 Last3/ }))
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    await settle()
    await user.click(screen.getByRole('button', { name: /First12 Last12/ }))
    await user.click(screen.getByRole('button', { name: 'Vérifier' }))
    await settle()
    const confirm = screen.getAllByRole('button').find((b) => /Valider|Confirmer|Envoyer|Voter$/.test((b.textContent ?? '').trim()) && !b.hasAttribute('disabled'))
    expect(confirm).toBeDefined()
    await user.click(confirm!)
    await waitFor(() => expect(fakeApi.called('PUT', /awards\/categories\/.+\/vote$/)).toHaveLength(2))
    const votes = fakeApi.called('PUT', /vote$/).map((c) => c.url)
    expect(votes.some((u) => u.includes('/c1/'))).toBe(true)
    expect(votes.some((u) => u.includes('/c2/'))).toBe(true)
  })

  it('can be postponed with "Voter plus tard"', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Voter plus tard' }))
    await settle()
    expect(screen.queryByText(/2 trophées à décerner/)).toBeNull()
  })

  it('a player cannot vote for himself — he is not in his own grid', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    await settle()
    expect(screen.queryByRole('button', { name: /First11 Last11/ })).toBeNull()
  })

  it('Retour goes back to the previous trophy', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    await user.click(await screen.findByRole('button', { name: /First3 Last3/ }))
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    await settle()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retour' }))
    await settle()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })
})
