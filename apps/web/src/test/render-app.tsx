import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { useAuthStore } from '@/lib/auth-store'
import type { User } from '@/lib/types'
import { fakeApi, fixtures, type Role } from './fake-api'

/** Renders the real <App/> at a route, signed in as the recorded coach / player / admin. */
export function renderApp(route: string, role: Role = 'coach', opts: { signedIn?: boolean; userPatch?: Partial<User> } = {}) {
  fakeApi.install(role)
  const user = fixtures.roles[role]['/users/me'] as User
  if (opts.signedIn === false) useAuthStore.setState({ accessToken: null, refreshToken: null, user: null })
  else useAuthStore.setState({ accessToken: 'test-access', refreshToken: 'test-refresh', user: { ...user, ...opts.userPatch } })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const WARM_ROUTES: [string, Role][] = [
  ['/trainings', 'coach'],
  ['/players', 'coach'],
  ['/matches', 'coach'],
  [`/matches/${fixtures.meta.upcomingMatchId}`, 'coach'],
  ['/stats', 'coach'],
  ['/profile', 'player'],
  ['/profile/edit', 'player'],
  ['/profile/badges', 'player'],
  ['/profile/trophies', 'player'],
  ['/profile/notifications', 'player'],
  ['/profile/password', 'player'],
  ['/profile/club', 'coach'],
  ['/player-ratings', 'coach'],
  ['/admin/import-pdf', 'coach'],
  ['/admin', 'admin'],
  ['/complete-profile', 'player'],
  ['/fix-positions', 'player'],
]

/** Renders every code-split page once (and throws it away) so React.lazy has settled. */
export async function warmUpLazyPages() {
  for (const [route, role] of WARM_ROUTES) {
    const patch = route === '/complete-profile' ? { birthDate: null, preferredFoot: null, positions: [] } : route === '/fix-positions' ? { positions: ['STRIKER', 'GOALKEEPER', 'CENTER_BACK', 'LEFT_BACK'] } : undefined
    const view = renderApp(route, role, { userPatch: patch as never })
    await act(() => new Promise<void>((r) => setTimeout(r, 120)))
    view.unmount()
  }
}
