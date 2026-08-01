/**
 * Pure URL policy for shared-link import transport (`INV-NET`).
 *
 * Every request target and every redirect hop must satisfy this before the
 * network stack follows it: HTTPS, no embedded credentials, the default port,
 * and an exact registered API host. Redaction hides the final path token (the
 * share id) from logs and errors.
 *
 * No Electron / Node imports — the whole policy is unit-testable in isolation.
 */

export type RemoteUrlError =
  | 'invalid-url'
  | 'insecure-scheme'
  | 'has-credentials'
  | 'non-default-port'
  | 'host-not-allowed'

export interface UrlCheck {
  ok: boolean
  url?: URL
  reason?: RemoteUrlError
}

/** API hosts the JSON share endpoints (and their redirects) may use. */
export const SHARE_API_HOSTS: readonly string[] = Object.freeze([
  'chatgpt.com',
  'chat.openai.com',
  'copilot.microsoft.com',
  'claude.ai',
  'claude.com',
])

/**
 * Gemini rendering may only ever navigate within these hosts. A sign-in redirect
 * to accounts.google.com (private/expired link) is deliberately NOT allowed — it
 * is denied, the window is destroyed, and the import reports no content.
 */
export const GEMINI_RENDER_HOSTS: readonly string[] = Object.freeze([
  'gemini.google.com',
  'share.gemini.google',
])

/**
 * Validate a URL against an exact host allowlist. Rejects non-HTTPS, embedded
 * userinfo, non-default ports, and unknown hosts. Punycode/Unicode confusion is
 * handled by comparing the URL's already-normalized ASCII `hostname`.
 */
export function validateRemoteUrl(raw: string, allowedHosts: readonly string[]): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'insecure-scheme' }
  if (url.username || url.password) return { ok: false, reason: 'has-credentials' }
  // Default HTTPS port only. `url.port` is '' when default.
  if (url.port !== '' && url.port !== '443') return { ok: false, reason: 'non-default-port' }

  const host = url.hostname.toLowerCase()
  if (!allowedHosts.includes(host)) return { ok: false, reason: 'host-not-allowed' }
  return { ok: true, url }
}

/**
 * Redact a URL for logs/errors: keep scheme + host + path shape but mask the
 * final path segment (the share/snapshot id). Never returns query or fragment.
 */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const segments = u.pathname.split('/').filter(Boolean)
    if (segments.length > 0) segments[segments.length - 1] = '<redacted>'
    return `${u.protocol}//${u.host}/${segments.join('/')}`
  } catch {
    return '<unparseable-url>'
  }
}
