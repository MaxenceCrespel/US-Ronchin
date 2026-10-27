import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationPreferencesCard } from '@/features/push/NotificationPreferencesCard'
import { useAuthStore } from '@/lib/auth-store'
import { fakeApi, fixtures, type RecordedCall } from './fake-api'
import type { User } from '@/lib/types'

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotificationPreferencesCard />
    </QueryClientProvider>,
  )
}

describe('NotificationPreferencesCard', () => {
  beforeEach(() => {
    fakeApi.install('player')
    useAuthStore.setState({ user: fixtures.roles.player['/users/me'] as User })
    fakeApi.on('GET', /push\/preferences$/, { mutedCategories: ['BIRTHDAYS'] })
    fakeApi.on('PUT', /push\/preferences$/, (call: RecordedCall) => call.data)
  })

  it('shows muted categories as off and hides the coach one from players', async () => {
    renderCard()
    expect(await screen.findByRole('switch', { name: 'Anniversaires' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Badges' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('switch', { name: 'Gestion coach' })).not.toBeInTheDocument()
  })

  it('saves a toggle right away', async () => {
    const user = userEvent.setup()
    renderCard()
    const badges = await screen.findByRole('switch', { name: 'Badges' })
    await user.click(badges)
    expect(badges).toHaveAttribute('aria-checked', 'false')
    await waitFor(() =>
      expect(fakeApi.called('PUT', /push\/preferences$/)[0]?.data).toEqual({ mutedCategories: ['BIRTHDAYS', 'BADGES'] }),
    )
  })

  it('shows the coach category to coaches', async () => {
    useAuthStore.setState({ user: fixtures.roles.coach['/users/me'] as User })
    renderCard()
    expect(await screen.findByRole('switch', { name: 'Gestion coach' })).toBeInTheDocument()
  })
})
