import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AwardsCeremony } from '@/features/awards/AwardsCeremony'
import { fixtures } from './fake-api'
import type { AwardCategory, PlayerStats, TeamStats } from '@/lib/types'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const team = fixtures.roles.coach['/stats/team'] as TeamStats
const players = fixtures.roles.coach['/stats/players'] as PlayerStats[]
const me = players[8]

function category(over: Partial<AwardCategory> = {}): AwardCategory {
  return {
    id: 'c1',
    key: 'mvp',
    title: 'MVP de la saison',
    season: '2026-2027',
    isActive: false,
    closedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    myVoteUserId: null,
    totalVotes: 6,
    results: [
      { userId: 'u1', firstName: 'Gagnant', lastName: 'Un', votes: 4 },
      { userId: 'u2', firstName: 'Second', lastName: 'Deux', votes: 2 },
    ],
    ...over,
  }
}

/** Presses whatever the ceremony currently asks for (reveal / next / finish) until it ends. */
async function playThrough(onDone: ReturnType<typeof vi.fn>, max = 80) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Ouvrir le rideau/ }))
  for (let i = 0; i < max && onDone.mock.calls.length === 0; i++) {
    await wait(350)
    const buttons = screen.queryAllByRole('button').filter((b) => !b.hasAttribute('disabled'))
    const preferred = buttons.find((b) => /Suivant|Terminer|Fermer|Révéler|Lancer|Tirer|Découvrir|Voir|Continuer|Passer/i.test(b.textContent ?? ''))
    const target = preferred ?? buttons.at(-1)
    if (!target) continue
    await user.click(target)
  }
  await wait(1300)
}

describe('season awards ceremony', () => {
  it('plays from the curtain to the end and reports done', async () => {
    const onDone = vi.fn()
    render(<AwardsCeremony season="2026-2027" categories={[category(), category({ id: 'c2', key: 'fair', title: 'Fair-play' })]} teamStats={team} roster={[]} myStats={me} onDone={onDone} />)
    expect(screen.getByText(/Cérémonie des trophées/)).toBeInTheDocument()
    await playThrough(onDone)
    expect(onDone).toHaveBeenCalled()
  }, 90_000)

  it('copes with a season with no data at all', async () => {
    const empty = { ...team, topScorers: [], topAssists: [], mostMotm: [], mostPatronDefense: [], mostPresent: [], topRated: [], bestDuos: [] } as TeamStats
    const onDone = vi.fn()
    render(<AwardsCeremony season="2026-2027" categories={[]} teamStats={empty} roster={[]} myStats={null} onDone={onDone} />)
    await playThrough(onDone, 20)
    expect(onDone).toHaveBeenCalled()
  }, 60_000)
})
