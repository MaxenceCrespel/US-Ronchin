import { render } from '@testing-library/react'
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
