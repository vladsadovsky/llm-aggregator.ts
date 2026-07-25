/**
 * import/conversationFetcher.ts
 * Transport layer for shared-link import. Uses Electron's networking:
 *  - `net.request` (Chromium stack) for JSON share APIs. Node's global fetch
 *    fails on Google's oversized response headers (UND_ERR_HEADERS_OVERFLOW),
 *    and Chromium's stack handles redirects/cookies more like a real browser.
 *  - a hidden BrowserWindow for Gemini, whose conversation is only rendered
 *    client-side (no server-provided JSON).
 */

import { net, BrowserWindow } from 'electron'
import { debugLog, debugError } from '../logger'
import { GEMINI_EXTRACT_SCRIPT, type GeminiExtract } from './parsers/geminiParser'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** GET a URL and parse the response as JSON via Chromium's network stack. */
export function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' })
    request.setHeader('User-Agent', USER_AGENT)
    request.setHeader('Accept', 'application/json')
    request.setHeader('Accept-Language', 'en-US,en;q=0.9')

    request.on('response', (response) => {
      const status = response.statusCode
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        if (status < 200 || status >= 300) {
          debugError('conversationFetcher', 'fetchJson non-2xx', status, url)
          reject(new Error(`Request failed (HTTP ${status}). The link may be private, expired, or invalid.`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          debugError('conversationFetcher', 'fetchJson parse error', err)
          reject(new Error('The share endpoint did not return valid JSON. The page format may have changed.'))
        }
      })
      response.on('error', (err: Error) => reject(err))
    })
    request.on('error', (err) => {
      debugError('conversationFetcher', 'fetchJson request error', err)
      reject(new Error('Could not reach the server. Check your internet connection and try again.'))
    })
    request.end()
  })
}

/**
 * Load a Gemini share URL in a hidden window, wait for the conversation to
 * render, and extract it from the DOM.
 */
export async function renderGemini(url: string, timeoutMs = 25000): Promise<GeminiExtract> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: false,
      javascript: true,
    },
  })

  try {
    await win.loadURL(url, { userAgent: USER_AGENT })

    const deadline = Date.now() + timeoutMs
    let last: GeminiExtract = { title: '', model: '', messages: [] }

    while (Date.now() < deadline) {
      const extract = (await win.webContents.executeJavaScript(
        GEMINI_EXTRACT_SCRIPT,
        true,
      )) as GeminiExtract | null

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
