import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { describeEnableError } from './subscribe'

describe('describeEnableError', () => {
  it('blames the browser when its push service refuses', () => {
    expect(describeEnableError(new DOMException('Registration failed - push service error', 'AbortError'))).toMatch(
      /navigateur bloque/,
    )
  })

  it('reports a server that answered with an error', () => {
    const err = new AxiosError('fail', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 500,
      statusText: 'Internal Server Error',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
    expect(describeEnableError(err)).toMatch(/erreur 500/)
  })

  it('reports a server that did not answer', () => {
    expect(describeEnableError(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatch(/ne répond pas/)
  })

  it('falls back to the generic message', () => {
    expect(describeEnableError(new Error('?'))).toBe("Impossible d'activer les notifications.")
  })
})
