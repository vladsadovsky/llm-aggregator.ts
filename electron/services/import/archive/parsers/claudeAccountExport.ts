/**
 * import/archive/parsers/claudeAccountExport.ts
 * Pure: Claude account export `conversations.json` → ParsedConversation[].
 *
 * Shape (verified against a real export, July 2026):
 *   [ { uuid, name, summary, created_at, updated_at, account, chat_messages[] } ]
 *
 * `chat_messages[]` matches the share-snapshot message shape, so extraction is
 * shared via `claudeMessages.ts`. Two differences from snapshots:
 *  - no `index` field — ordering comes from `created_at`
 *  - `content[]` is populated (thinking / tool_use / tool_result / token_budget
 *    blocks), and the flat `text` field is polluted with
 *    "This block is not supported on your current device yet." placeholders,
 *    so the typed text blocks must win. `extractClaudeText` already does that.
 *
 * `projects/` and `users.json` in the same export are intentionally ignored.
 */

import type { ParsedConversation } from '../../types'
import { parseClaudeMessages, claudeSkipWarnings } from '../../parsers/claudeMessages'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Structural check used by the format registry — cheap, no full parse. */
export function looksLikeClaudeAccountExport(json: unknown): boolean {
  if (!Array.isArray(json) || json.length === 0) return false
  return json.some(
    (c: any) =>
      c !== null &&
      typeof c === 'object' &&
      typeof c.uuid === 'string' &&
      Array.isArray(c.chat_messages) &&
      // `name` exists on Claude conversations; ChatGPT exports use `title` + `mapping`.
      'name' in c &&
      !('mapping' in c),
  )
}

/**
 * Parse the whole export. One ParsedConversation per conversation, in export
 * order. Conversations that yield no importable messages are still returned
 * (with a warning) so the preview can show them as empty rather than silently
 * dropping them.
 */
export function parseClaudeAccountExport(json: unknown): ParsedConversation[] {
  if (!Array.isArray(json)) return []

  const out: ParsedConversation[] = []
  for (const convo of json) {
    if (!convo || typeof convo !== 'object') continue
    const c = convo as any

    const warnings: string[] = []
    const raw = Array.isArray(c.chat_messages) ? c.chat_messages : []
    const { messages, stats } = parseClaudeMessages(raw)

    if (raw.length === 0) warnings.push('Conversation contained no chat_messages entries.')
    warnings.push(...claudeSkipWarnings(stats))
    if (messages.length === 0 && raw.length > 0) {
      warnings.push('No importable user/assistant text messages remained after parsing.')
    }

    const sourceId = typeof c.uuid === 'string' ? c.uuid : ''
    out.push({
      provider: 'claude',
      // Account exports carry no per-conversation URL; reconstruct the canonical one.
      url: sourceId ? `https://claude.ai/chat/${sourceId}` : '',
      title: typeof c.name === 'string' ? c.name.trim() : '',
      model: '',
      messages,
      warnings,
      ...(sourceId ? { sourceId } : {}),
      ...(typeof c.created_at === 'string' ? { createdAt: c.created_at } : {}),
    })
  }

  return out
}
