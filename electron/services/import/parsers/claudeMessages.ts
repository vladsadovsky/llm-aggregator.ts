/**
 * import/parsers/claudeMessages.ts
 * Pure: Claude `chat_messages[]` → ParsedMessage[].
 *
 * Shared by the two Claude payloads, which carry the same message shape inside
 * different envelopes:
 *  - share snapshots (`/api/chat_snapshots/<id>`) — ordered by an explicit
 *    `index`, and `content` is null so the flat `text` field is authoritative.
 *  - account exports (`conversations.json`) — no `index` (order by
 *    `created_at`), and `content[]` is populated. There the flat `text` field is
 *    NOT trustworthy: it inlines literal
 *    "```\nThis block is not supported on your current device yet.\n```"
 *    placeholders where thinking / tool blocks were stripped. The typed text
 *    blocks are clean, so they win whenever they exist.
 */

import type { ParsedMessage } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClaudeMessageStats {
  skippedUnknownRole: number
  skippedEmptyText: number
}

/**
 * Prefer the typed `content[]` text blocks; fall back to the flat `text` field.
 * Non-text blocks (thinking, tool_use, tool_result, token_budget, image) are not
 * part of the visible transcript and are dropped.
 */
export function extractClaudeText(message: any): string {
  const blocks = Array.isArray(message?.content) ? message.content : []
  const fromBlocks = blocks
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (fromBlocks) return fromBlocks
  return typeof message?.text === 'string' ? message.text.trim() : ''
}

/**
 * Order messages for display. Snapshots carry a numeric `index`; account
 * exports do not and are already chronological, so fall back to `created_at`
 * and finally to the array order (Array.prototype.sort is stable).
 */
function orderMessages(raw: any[]): any[] {
  const hasIndex = raw.some((m) => typeof m?.index === 'number')
  if (hasIndex) {
    return [...raw].sort((a, b) => (Number(a?.index) || 0) - (Number(b?.index) || 0))
  }
  const hasCreatedAt = raw.some((m) => typeof m?.created_at === 'string')
  if (hasCreatedAt) {
    return [...raw].sort((a, b) => (Date.parse(a?.created_at ?? '') || 0) - (Date.parse(b?.created_at ?? '') || 0))
  }
  return [...raw]
}

/** Convert a Claude `chat_messages[]` array into ordered ParsedMessages. */
export function parseClaudeMessages(rawMessages: unknown): {
  messages: ParsedMessage[]
  stats: ClaudeMessageStats
} {
  const raw = Array.isArray(rawMessages) ? rawMessages : []
  const stats: ClaudeMessageStats = { skippedUnknownRole: 0, skippedEmptyText: 0 }
  const messages: ParsedMessage[] = []

  for (const m of orderMessages(raw)) {
    const sender = m?.sender
    const role = sender === 'assistant' ? 'assistant' : sender === 'human' ? 'user' : null
    if (!role) {
      stats.skippedUnknownRole += 1
      continue
    }
    const text = extractClaudeText(m)
    if (!text) {
      // Tool-only turns carry no visible transcript text.
      stats.skippedEmptyText += 1
      continue
    }
    messages.push({ role, text, ...(typeof m?.uuid === 'string' && m.uuid ? { id: m.uuid } : {}) })
  }

  return { messages, stats }
}

/** Shared warning text so both Claude parsers report skips identically. */
export function claudeSkipWarnings(stats: ClaudeMessageStats): string[] {
  const warnings: string[] = []
  if (stats.skippedUnknownRole > 0) {
    warnings.push(`Skipped ${stats.skippedUnknownRole} Claude messages with unknown sender values.`)
  }
  if (stats.skippedEmptyText > 0) {
    warnings.push(
      `Skipped ${stats.skippedEmptyText} Claude messages with no text content (tool-only turns).`,
    )
  }
  return warnings
}
