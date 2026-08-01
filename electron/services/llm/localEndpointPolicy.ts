/**
 * Loopback-only endpoint policy for the local Ollama adapter (Phase 0.1).
 *
 * Prevents SSRF: a local-provider endpoint may only target the loopback
 * interface, never a LAN/public host, DNS name, credentials, or non-HTTP scheme.
 * Pure and dependency-free so the whole matrix is unit-testable.
 */

export type LocalEndpointError =
  | 'invalid-url'
  | 'bad-scheme'
  | 'has-credentials'
  | 'not-loopback'

export interface LocalEndpointCheck {
  ok: boolean
  origin?: string
  reason?: LocalEndpointError
}

/** IPv4 loopback is the whole 127.0.0.0/8 block; IPv6 loopback is ::1. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost') return true
  if (host === '::1' || host === '[::1]') return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const octets = m.slice(1).map(Number)
    if (octets.some((o) => o > 255)) return false
    return octets[0] === 127
  }
  return false
}

export function validateLocalEndpoint(raw: string): LocalEndpointCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'bad-scheme' }
  }
  if (url.username || url.password) return { ok: false, reason: 'has-credentials' }
  if (!isLoopbackHost(url.hostname)) return { ok: false, reason: 'not-loopback' }
  // Normalize to origin — no arbitrary path/query is carried from configuration.
  return { ok: true, origin: url.origin }
}
