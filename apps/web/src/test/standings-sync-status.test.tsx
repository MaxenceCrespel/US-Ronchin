import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from './render-app'
import { fakeApi } from './fake-api'

const logs = [
  { id: 'l2', runAt: '2026-10-12T19:05:00Z', status: 'ERROR', teamsFound: 0, errorMessage: 'Synchro locale : 403', triggeredBy: null },
  { id: 'l1', runAt: '2026-10-05T19:05:13Z', status: 'SUCCESS', teamsFound: 10, errorMessage: null, triggeredBy: null },
]

describe('standings sync status', () => {
  it('shows the admin a failed sync with its reason and the last success', async () => {
    renderApp('/championship', 'admin')
    fakeApi.on('GET', /standings\/logs$/, logs)
    expect(await screen.findByText(/échec \(Synchro locale : 403\)/)).toBeInTheDocument()
    expect(screen.getByText(/dernière réussite/)).toBeInTheDocument()
  })

  it('is hidden from coaches', async () => {
    renderApp('/championship', 'coach')
    fakeApi.on('GET', /standings\/logs$/, logs)
    expect(await screen.findByText('Classement du championnat')).toBeInTheDocument()
    expect(screen.queryByText(/Dernière synchro/)).toBeNull()
    expect(fakeApi.called('GET', /standings\/logs$/)).toHaveLength(0)
  })
})
