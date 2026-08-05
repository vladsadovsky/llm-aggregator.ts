import { describe, it, expect, vi } from 'vitest'
import {
  fetchJsonBounded,
  LlmTransportError,
  LLM_MAX_RESPONSE_BYTES,
  type HttpFetch,
} from '../../electron/services/llm/httpJson'

function okResponse(body: unknown, status = 200): Awaited<ReturnType<HttpFetch>> {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    json: async () => body,
    text: async () => text,
  }
}

describe('fetchJsonBounded', () => {
  it('returns parsed JSON on success', async () => {
    const fetchImpl: HttpFetch = async () => okResponse({ hello: 'world' })
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).resolves.toEqual({
      hello: 'world',
    })
  })

  it('maps non-OK HTTP status', async () => {
    const fetchImpl: HttpFetch = async () => okResponse({ err: true }, 500)
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).rejects.toMatchObject({
      code: 'http-error',
      status: 500,
    })
  })

  it('maps network failures', async () => {
    const fetchImpl: HttpFetch = async () => {
      throw new Error('ECONNREFUSED')
    }
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('honours caller abort before the request starts', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl: HttpFetch = async () => okResponse({})
    await expect(
      fetchJsonBounded('https://example.test/x', { signal: controller.signal }, fetchImpl),
    ).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('times out a hanging request', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl: HttpFetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      const pending = fetchJsonBounded(
        'https://example.test/x',
        { timeoutMs: 25 },
        fetchImpl,
      )
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
      await vi.advanceTimersByTimeAsync(30)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects oversized decoded bodies', async () => {
    const huge = 'x'.repeat(LLM_MAX_RESPONSE_BYTES + 8)
    const fetchImpl: HttpFetch = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode(huge).buffer,
      json: async () => ({}),
      text: async () => huge,
    })
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).rejects.toMatchObject({
      code: 'response-too-large',
    })
  })

  it('rejects malformed JSON', async () => {
    const fetchImpl: HttpFetch = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('not-json{').buffer,
      json: async () => {
        throw new Error('bad')
      },
      text: async () => 'not-json{',
    })
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).rejects.toBeInstanceOf(
      LlmTransportError,
    )
    await expect(fetchJsonBounded('https://example.test/x', {}, fetchImpl)).rejects.toMatchObject({
      code: 'malformed-json',
    })
  })
})
