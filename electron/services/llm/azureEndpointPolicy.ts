/**
 * Azure OpenAI endpoint policy (Phase 0.1).
 *
 * An Azure endpoint must be HTTPS, credential-free, default-port, fragment-free,
 * and on an approved Azure hostname; it is normalized to its origin so no
 * arbitrary path is carried from configuration. Pure and dependency-free.
 */

export type AzureEndpointError =
  | 'invalid-url'
  | 'insecure-scheme'
  | 'has-credentials'
  | 'non-default-port'
  | 'has-fragment'
  | 'host-not-allowed'

export interface AzureEndpointCheck {
  ok: boolean
  origin?: string
  reason?: AzureEndpointError
}

/** Approved Azure OpenAI host suffixes. */
export const AZURE_HOST_SUFFIXES: readonly string[] = Object.freeze([
  '.openai.azure.com',
  '.cognitiveservices.azure.com',
])

function isApprovedAzureHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return AZURE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
}

export function validateAzureEndpoint(raw: string): AzureEndpointCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'insecure-scheme' }
  if (url.username || url.password) return { ok: false, reason: 'has-credentials' }
  if (url.port !== '' && url.port !== '443') return { ok: false, reason: 'non-default-port' }
  if (url.hash) return { ok: false, reason: 'has-fragment' }
  if (!isApprovedAzureHost(url.hostname)) return { ok: false, reason: 'host-not-allowed' }
  return { ok: true, origin: url.origin }
}
