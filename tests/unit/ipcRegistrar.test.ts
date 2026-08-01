/**
 * INV-IPC: the validated registrar rejects untrusted senders and malformed
 * payloads with zero side effects, passes valid calls through, maps unexpected
 * throws to a redacted `internal` code, and forbids double registration.
 */
import { describe, it, expect, vi } from 'vitest'
import type { IpcMain } from 'electron'

// The registrar imports the real `ipcMain` for its default param; tests always
// pass a fake, so a stub is enough to satisfy the module import.
vi.mock('electron', () => ({ ipcMain: {} }))
import { createRegistrar } from '../../electron/ipc/registerValidatedHandler'
import { CH } from '../../shared/contracts/channels'
import { extractWireError, IpcError } from '../../shared/contracts/errorWire'
import type { SenderPolicy } from '../../electron/ipc/senderPolicy'

function harness() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
  const fakeIpc = {
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      handlers.set(ch, fn),
  } as unknown as IpcMain

  const mainFrame = { url: 'https://localhost:5173/index.html' }
  const sender = { mainFrame, isDestroyed: () => false }
  const policy: SenderPolicy = { trusted: () => sender as never, allowedOrigins: () => [] }
  const goodEvent = { sender, senderFrame: mainFrame }
  return { handlers, fakeIpc, policy, sender, mainFrame, goodEvent }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
    return undefined
  } catch (err) {
    return extractWireError((err as Error).message)?.code
  }
}

describe('createRegistrar', () => {
  it('passes a valid, trusted call through to the handler', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    const spy = vi.fn((_e: unknown, id: string) => `got:${id}`)
    r.handle(CH.qaGet, spy)
    const result = await h.handlers.get(CH.qaGet)!(h.goodEvent, '20260204_2135')
    expect(result).toBe('got:20260204_2135')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('rejects an untrusted sender without calling the handler', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    const spy = vi.fn(() => 'x')
    r.handle(CH.qaDelete, spy)
    const otherFrame = { url: 'https://evil.example' }
    const badEvent = { sender: { mainFrame: otherFrame, isDestroyed: () => false }, senderFrame: otherFrame }
    expect(await codeOf(h.handlers.get(CH.qaDelete)!(badEvent, '20260204_2135'))).toBe('invalid-sender')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a malformed payload without calling the handler', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    const spy = vi.fn(() => 'x')
    r.handle(CH.qaDelete, spy)
    expect(await codeOf(h.handlers.get(CH.qaDelete)!(h.goodEvent, '../escape'))).toBe('invalid-payload')
    expect(spy).not.toHaveBeenCalled()
  })

  it('passes an intentional IpcError code through unchanged', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    r.handle(CH.qaGet, () => {
      throw new IpcError('not-found', 'gone')
    })
    expect(await codeOf(h.handlers.get(CH.qaGet)!(h.goodEvent, '20260204_2135'))).toBe('not-found')
  })

  it('maps an unexpected throw to a redacted internal code', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    r.handle(CH.qaGet, () => {
      throw new Error('ENOENT: C:/secret/path.md not found')
    })
    const code = await codeOf(h.handlers.get(CH.qaGet)!(h.goodEvent, '20260204_2135'))
    expect(code).toBe('internal')
  })

  it('never leaks a filesystem path in the wire message', async () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    r.handle(CH.qaGet, () => {
      throw new Error('ENOENT: C:/secret/path.md not found')
    })
    try {
      await h.handlers.get(CH.qaGet)!(h.goodEvent, '20260204_2135')
    } catch (err) {
      expect((err as Error).message).not.toContain('secret')
      expect((err as Error).message).not.toContain('path.md')
    }
  })

  it('forbids registering the same channel twice', () => {
    const h = harness()
    const r = createRegistrar(h.policy, h.fakeIpc)
    r.handle(CH.qaGet, () => 'a')
    expect(() => r.handle(CH.qaGet, () => 'b')).toThrow(/twice/)
  })
})
