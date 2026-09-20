import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/lib/api-client'
import raw from './fixtures/api.json'

export type Role = 'coach' | 'player' | 'admin'

interface Fixtures {
  meta: Record<string, string | string[]>
  roles: Record<Role, Record<string, unknown>>
}
export const fixtures = raw as unknown as Fixtures
export const meta = fixtures.meta as {
  coachId: string
  adminId: string
  playerId: string
  playerIds: string[]
  matchIds: string[]
  upcomingMatchId: string
  sessionIds: string[]
  upcomingSessionId: string
  trainingId: string
}

export interface RecordedCall {
  method: string
  url: string
  data: unknown
}

type Handler = (call: RecordedCall) => unknown | Promise<unknown>
interface Override {
  method: string
  pattern: RegExp
  handler: Handler
  status: number
}

/** Serves the recorded real-API answers (see apps/api dump-fixtures.spec.ts) as an axios
 * adapter: a GET returns what the real backend returned for that role, a write returns a
 * benign success unless a test overrides it. Every call is recorded so tests can assert on
 * what the UI actually sent. */
export class FakeApi {
  calls: RecordedCall[] = []
  private overrides: Override[] = []
  role: Role = 'coach'

  on(method: string, pattern: RegExp, handler: Handler | unknown, status = 200) {
    this.overrides.unshift({
      method: method.toUpperCase(),
      pattern,
      status,
      handler: typeof handler === 'function' ? (handler as Handler) : () => handler,
    })
  }

  called(method: string, pattern: RegExp): RecordedCall[] {
    return this.calls.filter((c) => c.method === method.toUpperCase() && pattern.test(c.url))
  }

  install(role: Role) {
    this.role = role
    this.calls = []
    this.overrides = []
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'get').toUpperCase()
      const url = (config.url ?? '').split('?')[0].replace(/^\/api/, '')
      let data: unknown = config.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch {
          /* keep raw */
        }
      }
      const call: RecordedCall = { method, url, data }
      this.calls.push(call)

      const respond = (status: number, body: unknown): Promise<AxiosResponse> => {
        const response = { data: body, status, statusText: String(status), headers: {}, config, request: {} }
        if (status >= 200 && status < 300) return Promise.resolve(response)
        return Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response, config }))
      }

      const hit = this.overrides.find((o) => o.method === method && o.pattern.test(url))
      if (hit) return respond(hit.status, await hit.handler(call))

      if (method === 'GET') {
        const own = fixtures.roles[this.role]
        const body = url in own ? own[url] : fixtures.roles.coach[url]
        if (body === undefined) return respond(404, { message: `no fixture for GET ${url}` })
        return respond(200, body)
      }
      return respond(200, {})
    }
    apiClient.defaults.adapter = adapter
  }
}

export const fakeApi = new FakeApi()
