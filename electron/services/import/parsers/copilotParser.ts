/**
 * import/parsers/copilotParser.ts
 * Pure: Copilot share API JSON → ParsedConversation.
 *
 * The endpoint (`/c/api/conversations/shares/<id>`) returns
 * `{ conversationTitle, type, messages[] }`. Messages arrive newest-first and
 * each has `author` ("human" | "ai"), `createdAt`, and a `content[]` array of
 * typed parts (text / citation / card / ...). We sort chronologically and keep
 * the text parts.
 */

import type { ParsedConversation, ParsedMessage } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractText(message: any): string {
  const parts = Array.isArray(message?.content) ? message.content : []
  return parts
    .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function parseCopilot(json: any, url: string): ParsedConversation {
  const warnings: string[] = []
  const raw = Array.isArray(json?.messages) ? [...json.messages] : []
  let skippedUnknownRole = 0
  let skippedEmptyText = 0

  // API returns messages newest-first — sort ascending by createdAt.
  raw.sort((a: any, b: any) => {
    const ta = Date.parse(a?.createdAt ?? '') || 0
    const tb = Date.parse(b?.createdAt ?? '') || 0
    return ta - tb
  })

  const messages: ParsedMessage[] = []
  for (const m of raw) {
    const author = m?.author
    const role = author === 'ai' ? 'assistant' : author === 'human' ? 'user' : null
    if (!role) {
      skippedUnknownRole += 1
      continue
    }
    const text = extractText(m)
    if (!text) {
      skippedEmptyText += 1
      continue
    }
    messages.push({ role, text })
  }

  if (raw.length === 0) {
    warnings.push('Copilot response contained no messages array entries.')
  }
  if (skippedUnknownRole > 0) {
    warnings.push(`Skipped ${skippedUnknownRole} Copilot messages with unknown author values.`)
  }
  if (skippedEmptyText > 0) {
    warnings.push(`Skipped ${skippedEmptyText} Copilot messages with no text content.`)
  }
  if (messages.length === 0 && raw.length > 0) {
    warnings.push('No importable user/assistant text messages remained after parsing Copilot payload.')
  }

  const title = typeof json?.conversationTitle === 'string' ? json.conversationTitle.trim() : ''

  // Copilot's share API does not expose a model slug — the label falls back to
  // the provider name ("Copilot") in the orchestrator.
  return { provider: 'copilot', url, title, model: '', messages, warnings }
}
