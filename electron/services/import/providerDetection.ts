/**
 * import/providerDetection.ts
 * Pure URL → provider detection and provider-level constants.
 */

import type { ProviderId } from './types'

export interface ProviderMatch {
  provider: ProviderId
  shareId: string
}

/** Human-readable chatbot label per provider (used as a fallback tag / model label). */
export const PROVIDER_LABEL: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  copilot: 'Copilot',
  claude: 'Claude',
}

/** Value written to the QA `source` frontmatter field. Must match an allowed source. */
export const PROVIDER_SOURCE: Record<ProviderId, string> = {
  chatgpt: 'chatgpt',
  gemini: 'gemini',
  copilot: 'copilot',
  claude: 'claude',
}

/**
 * Detect the provider and share id from a shared-conversation URL.
 * Returns null for unrecognized / malformed / non-HTTPS URLs.
 *
 * HTTPS only (S6/SEC-03): a Gemini share URL is rendered in a hidden window, so
 * a plaintext http: link could be modified in transit and then executed there.
 * `classifyShareUrl` distinguishes that case for a clearer message.
 */
export function detectProvider(rawUrl: string): ProviderMatch | null {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null

  const host = u.hostname.toLowerCase()
  const path = u.pathname

  // ChatGPT: chatgpt.com/share/<id> or /share/e/<id>; legacy chat.openai.com
  if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') {
    const m = path.match(/\/share\/(?:e\/)?([\w-]+)/i)
    if (m) return { provider: 'chatgpt', shareId: m[1] }
  }

  // Gemini: legacy gemini.google.com/share/<id> or share.gemini.google/<id>.
  if (host === 'gemini.google.com' || host === 'share.gemini.google') {
    const m = host === 'share.gemini.google'
      ? path.match(/^\/([\w-]+)\/?$/i)
      : path.match(/\/share\/([\w-]+)/i)
    if (m) return { provider: 'gemini', shareId: m[1] }
  }

  // Copilot: copilot.microsoft.com/shares/<id>
  if (host === 'copilot.microsoft.com' || host.endsWith('.copilot.microsoft.com')) {
    const m = path.match(/\/shares\/([\w-]+)/i)
    if (m) return { provider: 'copilot', shareId: m[1] }
  }

  // Claude: claude.ai/share/<uuid> (claude.com is an accepted alias).
  if (host === 'claude.ai' || host === 'claude.com' || host.endsWith('.claude.ai') || host.endsWith('.claude.com')) {
    const m = path.match(/\/share\/([\w-]+)/i)
    if (m) return { provider: 'claude', shareId: m[1] }
  }

  return null
}

export type ShareUrlClassification =
  | { kind: 'ok'; match: ProviderMatch }
  | { kind: 'insecure-scheme' }
  | { kind: 'unsupported' }

/**
 * Classify a share URL so the orchestrator can explain a rejection instead of
 * returning a bare null. An `http:` URL is called out specifically — it is a
 * different problem (use https) from a link we simply do not support.
 */
export function classifyShareUrl(rawUrl: string): ShareUrlClassification {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    return { kind: 'unsupported' }
  }
  if (u.protocol === 'http:') return { kind: 'insecure-scheme' }
  const match = detectProvider(rawUrl)
  return match ? { kind: 'ok', match } : { kind: 'unsupported' }
}

/**
 * Normalize a string into a lowercase, hyphenated tag.
 * "Gemini 3.6 Flash" → "gemini-3.6-flash"; "GPT-5 (Instant)" → "gpt-5-instant".
 */
export function normalizeTag(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w.\-\s]/g, '') // drop punctuation except word chars, dot, hyphen
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}
