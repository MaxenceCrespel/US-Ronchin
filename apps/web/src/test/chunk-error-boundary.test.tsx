import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChunkErrorBoundary } from '@/app/ChunkErrorBoundary'

function Throws({ message }: { message: string }): never {
  throw new Error(message)
}

// React logs a render error to the console even when a boundary catches it — expected noise
// for these tests, silenced so it doesn't read as a real test failure.
const spyConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('ChunkErrorBoundary', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('reloads once, silently, on a stale-chunk load failure', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const consoleError = spyConsoleError()

    render(
      <ChunkErrorBoundary>
        <Throws message="Failed to fetch dynamically imported module: https://usronchin.fr/assets/PlayerRatingsPage-old.js" />
      </ChunkErrorBoundary>,
    )

    expect(reload).toHaveBeenCalledTimes(1)
    // No "Recharger" fallback shown for this case — a spinner instead, the reload is already
    // in flight.
    expect(screen.queryByRole('button', { name: 'Recharger' })).not.toBeInTheDocument()
    consoleError.mockRestore()
  })

  it("shows a retry screen, and doesn't reload on its own, for a real bug", async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const consoleError = spyConsoleError()

    render(
      <ChunkErrorBoundary>
        <Throws message="Cannot read properties of undefined (reading 'foo')" />
      </ChunkErrorBoundary>,
    )

    expect(reload).not.toHaveBeenCalled()
    const button = await screen.findByRole('button', { name: 'Recharger' })
    const user = userEvent.setup()
    await user.click(button)
    expect(reload).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <ChunkErrorBoundary>
        <p>Tout va bien</p>
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText('Tout va bien')).toBeInTheDocument()
  })
})
