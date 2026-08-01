/**
 * INV-IPC: only the trusted main-window top frame, loaded from the app origin,
 * may invoke a privileged channel. Everything else is rejected before argument
 * parsing or any service call.
 */
import { describe, it, expect } from 'vitest'
import {
  isTrustedSender,
  type SenderPolicy,
  type SenderCheckEvent,
} from '../../electron/ipc/senderPolicy'

const APP_ORIGIN = 'https://localhost:5173'

/** A fake trusted webContents with its own main frame. */
function makeTrusted(url = `${APP_ORIGIN}/index.html`, destroyed = false) {
  const mainFrame = { url }
  const sender = { mainFrame, isDestroyed: () => destroyed }
  return { sender, mainFrame }
}

function policyFor(sender: unknown, origins: string[] = [APP_ORIGIN]): SenderPolicy {
  return {
    trusted: () => sender as never,
    allowedOrigins: () => origins,
  }
}

describe('isTrustedSender', () => {
  it('accepts the trusted main frame from the app origin', () => {
    const { sender, mainFrame } = makeTrusted()
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(sender))).toBe(true)
  })

  it('rejects when there is no trusted webContents yet', () => {
    const { sender, mainFrame } = makeTrusted()
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(null))).toBe(false)
  })

  it('rejects a different webContents', () => {
    const trusted = makeTrusted()
    const other = makeTrusted()
    const event: SenderCheckEvent = { sender: other.sender, senderFrame: other.mainFrame }
    expect(isTrustedSender(event, policyFor(trusted.sender))).toBe(false)
  })

  it('rejects a subframe (senderFrame is not the main frame)', () => {
    const { sender } = makeTrusted()
    const subframe = { url: `${APP_ORIGIN}/iframe.html` }
    const event: SenderCheckEvent = { sender, senderFrame: subframe }
    expect(isTrustedSender(event, policyFor(sender))).toBe(false)
  })

  it('rejects a destroyed sender', () => {
    const { sender, mainFrame } = makeTrusted(`${APP_ORIGIN}/index.html`, true)
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(sender))).toBe(false)
  })

  it('rejects a null sender frame', () => {
    const { sender } = makeTrusted()
    const event: SenderCheckEvent = { sender, senderFrame: null }
    expect(isTrustedSender(event, policyFor(sender))).toBe(false)
  })

  it('rejects an off-origin main frame', () => {
    const { sender, mainFrame } = makeTrusted('https://evil.example/index.html')
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(sender, [APP_ORIGIN]))).toBe(false)
  })

  it('rejects a frame with an unparseable url when origins are enforced', () => {
    const { sender, mainFrame } = makeTrusted('not a url')
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(sender, [APP_ORIGIN]))).toBe(false)
  })

  it('skips the origin check when the allowed-origin list is empty', () => {
    const { sender, mainFrame } = makeTrusted('file:///weird/path.html')
    const event: SenderCheckEvent = { sender, senderFrame: mainFrame }
    expect(isTrustedSender(event, policyFor(sender, []))).toBe(true)
  })
})
