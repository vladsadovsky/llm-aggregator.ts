/**
 * import/parsers/claudeParser.ts
 * Pure: Claude chat-snapshot JSON → ParsedConversation.
 *
 * The snapshot endpoint (`/api/chat_snapshots/<id>`) returns
 * `{ uuid, conversation_uuid, snapshot_name, chat_messages[], up_to_date, ... }`.
 * Message-level handling is shared with the account-export parser — see
 * `claudeMessages.ts`.
 *
 * The payload carries no model identifier, so `model` stays empty and the
 * orchestrator falls back to the provider label ("Claude").
 */

import type { ParsedConversation } from '../types'
import { parseClaudeMessages, claudeSkipWarnings } from './claudeMessages'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseClaude(json: any, url: string): ParsedConversation {
  const warnings: string[] = []
  const raw = Array.isArray(json?.chat_messages) ? json.chat_messages : []
  const { messages, stats } = parseClaudeMessages(raw)

  if (raw.length === 0) {
    warnings.push('Claude response contained no chat_messages entries.')
  }
  warnings.push(...claudeSkipWarnings(stats))
  if (messages.length === 0 && raw.length > 0) {
    warnings.push('No importable user/assistant text messages remained after parsing Claude payload.')
  }
  // A snapshot is a point-in-time copy; the live conversation may have moved on.
  if (json?.up_to_date === false) {
    warnings.push('This share link is an outdated snapshot — the original conversation has changed since it was shared.')
  }

  const title = typeof json?.snapshot_name === 'string' ? json.snapshot_name.trim() : ''
  // Prefer the underlying conversation id so a shared link and the same
  // conversation in an account export produce matching dedup keys.
  const sourceId =
    (typeof json?.conversation_uuid === 'string' && json.conversation_uuid) ||
    (typeof json?.uuid === 'string' && json.uuid) ||
    ''

  return {
    provider: 'claude',
    url,
    title,
    model: '',
    messages,
    warnings,
    ...(sourceId ? { sourceId } : {}),
    ...(typeof json?.created_at === 'string' ? { createdAt: json.created_at } : {}),
  }
}
