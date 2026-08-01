/**
 * INV-NET: the shared-link transport is bounded — approved hosts only, validated
 * redirects with a hop cap, a body ceiling, an overall timeout, and structured
 * error codes. Exercised through an injected fake net layer.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ net: {}, BrowserWindow: class {}, session: {} }))

import {
  fetchJson,
  RemoteTransportError,
  type NetLike,
  type NetRequestLike,
} from '../../electron/services/import/conversationFetcher'

type Hop =
  | { redirect: string }
  | { response: { status: number; body: string } }
  | { hang: true }

/** A scripted fake of Electron's manual-redirect ClientRequest. */
function fakeNet(hops: Hop[]): NetLike {
  return {
    request(): NetRequestLike {
      const H: Record<string, (...a: unknown[]) => void> = {}
      let idx = 0
      const emitNext = () => {
        const hop = hops[idx++]
        if (!hop) {
          setImmediate(() => H.error?.(new Error('no more hops')))
          return
        }
        if ('hang' in hop) return // never emits → timeout path
        if ('redirect' in hop) {
          setImmediate(() => H.redirect?.(302, 'GET', hop.redirect))
          return
        }
        const rh: Record<string, (...a: unknown[]) => void> = {}
        const res = {
          statusCode: hop.response.status,
          on: (ev: string, cb: (...a: unknown[]) => void) => (rh[ev] = cb),
        }
        setImmediate(() => {
          H.response?.(res)
          setImmediate(() => {
            if (hop.response.body.length) rh.data?.(Buffer.from(hop.response.body))
            rh.end?.()
          })
        })
      }
      return {
        setHeader() {},
        on: (ev: string, cb: (...a: unknown[]) => void) => {
          H[ev] = cb
        },
        followRedirect: () => emitNext(),
        abort() {},
        end: () => emitNext(),
      }
    },
  }
}

const OK = 'https://claude.ai/api/chat_snapshots/abc'

describe('fetchJson transport', () => {
  it('parses a 2xx JSON response', async () => {
    const net = fakeNet([{ response: { status: 200, body: '{"ok":true}' } }])
    await expect(fetchJson(OK, { net })).resolves.toEqual({ ok: true })
  })

  it('rejects an invalid initial host before any request', async () => {
    await expect(fetchJson('https://evil.example/x', { net: fakeNet([]) })).rejects.toMatchObject({
      code: 'invalid-url',
    })
  })

  it('follows an allowed redirect then parses', async () => {
    const net = fakeNet([
      { redirect: 'https://claude.com/api/chat_snapshots/abc' },
      { response: { status: 200, body: '{"v":1}' } },
    ])
    await expect(fetchJson(OK, { net })).resolves.toEqual({ v: 1 })
  })

  it('rejects a redirect to a disallowed host', async () => {
    const net = fakeNet([{ redirect: 'https://evil.example/steal' }])
    await expect(fetchJson(OK, { net })).rejects.toMatchObject({ code: 'redirect-disallowed' })
  })

  it('rejects when the hop cap is exceeded', async () => {
    const net = fakeNet([
      { redirect: 'https://claude.ai/1' },
      { redirect: 'https://claude.ai/2' },
      { redirect: 'https://claude.ai/3' },
      { redirect: 'https://claude.ai/4' },
    ])
    await expect(fetchJson(OK, { net, maxHops: 3 })).rejects.toMatchObject({ code: 'redirect-limit' })
  })

  it('aborts when the body exceeds the ceiling', async () => {
    const net = fakeNet([{ response: { status: 200, body: 'x'.repeat(10_000) } }])
    await expect(fetchJson(OK, { net, maxBytes: 100 })).rejects.toMatchObject({
      code: 'response-too-large',
    })
  })

  it('maps a non-2xx to an http-error with the status', async () => {
    const net = fakeNet([{ response: { status: 403, body: '' } }])
    await expect(fetchJson(OK, { net })).rejects.toMatchObject({ code: 'http-error', httpStatus: 403 })
  })

  it('rejects malformed JSON as format-changed', async () => {
    const net = fakeNet([{ response: { status: 200, body: '{not json' } }])
    await expect(fetchJson(OK, { net })).rejects.toMatchObject({ code: 'format-changed' })
  })

  it('times out when the endpoint never responds', async () => {
    const net = fakeNet([{ hang: true }])
    await expect(fetchJson(OK, { net, timeoutMs: 30 })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('errors are RemoteTransportError instances', async () => {
    const net = fakeNet([{ response: { status: 500, body: '' } }])
    await expect(fetchJson(OK, { net })).rejects.toBeInstanceOf(RemoteTransportError)
  })
})
