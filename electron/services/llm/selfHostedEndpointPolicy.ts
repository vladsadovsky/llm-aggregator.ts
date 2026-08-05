/**
 * Endpoint policy for a trusted self-hosted OpenAI-compatible server. Unlike
 * the Ollama policy, the complete configured base URL is retained so several
 * servers can coexist behind distinct DGX routes.
 */
export type SelfHostedEndpointError =
  | 'invalid-url'
  | 'bad-scheme'
  | 'has-credentials'
  | 'has-query-or-fragment'
  | 'untrusted-host'
  | 'insecure-lan-http'

export interface SelfHostedEndpointCheck {
  ok: boolean
  baseUrl?: string
  reason?: SelfHostedEndpointError
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

export function validateSelfHostedEndpoint(
  raw: string,
  trustedHosts: readonly string[],
  allowInsecureLanHttp: boolean,
): SelfHostedEndpointCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'bad-scheme' }
  if (url.username || url.password) return { ok: false, reason: 'has-credentials' }
  if (url.search || url.hash) return { ok: false, reason: 'has-query-or-fragment' }

  const host = url.hostname.toLowerCase()
  const trusted = trustedHosts.some((value) => value.trim().toLowerCase() === host)
  if (!isLoopback(host) && !trusted) return { ok: false, reason: 'untrusted-host' }
  if (url.protocol === 'http:' && !isLoopback(host) && !allowInsecureLanHttp) {
    return { ok: false, reason: 'insecure-lan-http' }
  }

  return { ok: true, baseUrl: url.href.replace(/\/$/, '') }
}
