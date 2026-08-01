/**
 * import/conversationFetcher.ts
 * Transport layer for shared-link import. Uses Electron's networking:
 *  - `net.request` (Chromium stack) for JSON share APIs. Node's global fetch
 *    fails on Google's oversized response headers (UND_ERR_HEADERS_OVERFLOW),
 *    and Chromium's stack handles cookies more like a real browser.
 *  - a hidden BrowserWindow for Gemini, whose conversation is only rendered
 *    client-side (no server-provided JSON).
 *
 * Transport is bounded (`INV-NET`): manual redirect handling with an approved
 * host allowlist, a hop cap, an overall wall-clock timeout, and a decoded-body
 * ceiling. The Gemini window is contained: a unique non-persistent partition, no
 * preload, denied popups/permissions, and a navigation allowlist.
 */

import { net as electronNet, BrowserWindow, session } from 'electron'
import { randomUUID } from 'crypto'
import { debugLog, debugError } from '../logger'
import { GEMINI_EXTRACT_SCRIPT, type GeminiExtract } from './parsers/geminiParser'
import {
  validateRemoteUrl,
  redactUrl,
  SHARE_API_HOSTS,
  GEMINI_RENDER_HOSTS,
} from './remoteUrlPolicy'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// Conservative transport limits; tune only from real sanitized fixtures.
export const MAX_REDIRECT_HOPS = 3
export const FETCH_TIMEOUT_MS = 20_000
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024

export type TransportErrorCode =
  | 'invalid-url'
  | 'redirect-disallowed'
  | 'redirect-limit'
  | 'timeout'
  | 'response-too-large'
  | 'unreachable'
  | 'http-error'
  | 'format-changed'

export class RemoteTransportError extends Error {
  readonly code: TransportErrorCode
  readonly httpStatus?: number
  constructor(code: TransportErrorCode, message: string, httpStatus?: number) {
    super(message)
    this.name = 'RemoteTransportError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Injectable net layer (real Electron by default; a fake in tests) ─────────

export interface NetResponseLike {
  statusCode: number
  on(event: 'data', cb: (chunk: Buffer) => void): void
  on(event: 'end', cb: () => void): void
  on(event: 'error', cb: (err: Error) => void): void
}
export interface NetRequestLike {
  setHeader(name: string, value: string): void
  on(event: 'response', cb: (res: NetResponseLike) => void): void
  on(event: 'redirect', cb: (statusCode: number, method: string, redirectUrl: string) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  followRedirect(): void
  abort(): void
  end(): void
}
export interface NetLike {
  request(options: { url: string; method: string; redirect: 'manual' }): NetRequestLike
}

const defaultNet: NetLike = {
  request: (options) => electronNet.request(options) as unknown as NetRequestLike,
}

export interface FetchOptions {
  net?: NetLike
  maxHops?: number
  timeoutMs?: number
  maxBytes?: number
}

/**
 * GET a share-API URL and parse JSON via a bounded, redirect-validated request.
 */
export function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const netImpl = options.net ?? defaultNet
  const maxHops = options.maxHops ?? MAX_REDIRECT_HOPS
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES

  return new Promise((resolve, reject) => {
    const first = validateRemoteUrl(url, SHARE_API_HOSTS)
    if (!first.ok) {
      reject(new RemoteTransportError('invalid-url', `Rejected share endpoint (${first.reason}).`))
      return
    }

    let settled = false
    let hops = 0
    let bytes = 0
    const chunks: Buffer[] = []
    let request: NetRequestLike | null = null

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      request?.abort()
      reject(new RemoteTransportError('timeout', 'The share endpoint took too long to respond.'))
    }, timeoutMs)

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    request = netImpl.request({ url, method: 'GET', redirect: 'manual' })
    request.setHeader('User-Agent', USER_AGENT)
    request.setHeader('Accept', 'application/json')
    request.setHeader('Accept-Language', 'en-US,en;q=0.9')

    request.on('redirect', (_status, _method, redirectUrl) => {
      if (settled) return
      hops += 1
      if (hops > maxHops) {
        request?.abort()
        finish(() =>
          reject(new RemoteTransportError('redirect-limit', 'Too many redirects following the share link.')),
        )
        return
      }
      const check = validateRemoteUrl(redirectUrl, SHARE_API_HOSTS)
      if (!check.ok) {
        debugError('conversationFetcher', 'blocked redirect to', redactUrl(redirectUrl), check.reason)
        request?.abort()
        finish(() =>
          reject(
            new RemoteTransportError('redirect-disallowed', 'The share link redirected to a disallowed location.'),
          ),
        )
        return
      }
      request?.followRedirect()
    })

    request.on('response', (response) => {
      const status = response.statusCode
      response.on('data', (chunk) => {
        if (settled) return
        bytes += chunk.length
        if (bytes > maxBytes) {
          request?.abort()
          finish(() =>
            reject(new RemoteTransportError('response-too-large', 'The share response exceeded the size limit.')),
          )
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      response.on('end', () => {
        if (settled) return
        if (status < 200 || status >= 300) {
          finish(() =>
            reject(
              new RemoteTransportError(
                'http-error',
                `Request failed (HTTP ${status}). The link may be private, expired, or invalid.`,
                status,
              ),
            ),
          )
          return
        }
        const body = Buffer.concat(chunks).toString('utf-8')
        try {
          const json = JSON.parse(body)
          finish(() => resolve(json))
        } catch {
          finish(() =>
            reject(
              new RemoteTransportError('format-changed', 'The share endpoint did not return valid JSON.'),
            ),
          )
        }
      })
      response.on('error', (err) => finish(() => reject(err)))
    })

    request.on('error', () => {
      finish(() =>
        reject(new RemoteTransportError('unreachable', 'Could not reach the server. Check your connection.')),
      )
    })

    request.end()
  })
}

/**
 * Load a Gemini share URL in a hidden, contained window and extract the
 * conversation from the DOM. The window uses a unique non-persistent partition,
 * denies popups and permission requests, and permits navigation only within the
 * Gemini render hosts; a sign-in redirect (private/expired link) is blocked and
 * yields no content.
 */
export async function renderGemini(url: string, timeoutMs = 25000): Promise<GeminiExtract> {
  const first = validateRemoteUrl(url, GEMINI_RENDER_HOSTS)
  if (!first.ok) {
    throw new RemoteTransportError('invalid-url', 'Rejected Gemini share URL.')
  }

  // Unique, non-persistent partition (no `persist:` prefix → in-memory only).
  const partition = `gemini-import-${randomUUID()}`
  const partSession = session.fromPartition(partition)
  partSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  partSession.setPermissionCheckHandler(() => false)

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: false,
      javascript: true,
    },
  })

  const wc = win.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))

  const blockOffPolicy = (target: string, prevent: () => void) => {
    if (!validateRemoteUrl(target, GEMINI_RENDER_HOSTS).ok) {
      prevent()
      debugError('conversationFetcher', 'blocked gemini navigation to', redactUrl(target))
      if (!win.isDestroyed()) win.destroy()
    }
  }
  wc.on('will-navigate', (event, target) => blockOffPolicy(target, () => event.preventDefault()))
  wc.on('will-redirect', (event, target) => blockOffPolicy(target, () => event.preventDefault()))

  try {
    await win.loadURL(url, { userAgent: USER_AGENT })

    const deadline = Date.now() + timeoutMs
    let last: GeminiExtract = { title: '', model: '', messages: [] }

    while (Date.now() < deadline) {
      if (win.isDestroyed()) break
      // Only extract while still on an approved origin.
      if (!validateRemoteUrl(wc.getURL(), GEMINI_RENDER_HOSTS).ok) break

      const extract = (await wc.executeJavaScript(GEMINI_EXTRACT_SCRIPT, true).catch(() => null)) as
        | GeminiExtract
        | null

      if (extract) {
        last = extract
        const ready =
          Array.isArray(extract.messages) &&
          extract.messages.length > 0 &&
          extract.messages.every((m) => m.text && m.text.length > 0)
        if (ready) {
          debugLog('conversationFetcher', 'gemini extract ready:', extract.messages.length, 'turns')
          return extract
        }
      }
      await delay(600)
    }

    debugLog('conversationFetcher', 'gemini extract timed out; returning last snapshot')
    return last
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
