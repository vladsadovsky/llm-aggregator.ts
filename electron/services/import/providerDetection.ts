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
 * Returns null for unrecognized / malformed URLs.
 */
export function detectProvider(rawUrl: string): ProviderMatch | null {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null

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
