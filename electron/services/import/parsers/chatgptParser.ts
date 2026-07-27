/**
 * import/parsers/chatgptParser.ts
 * Pure: ChatGPT backend-api share JSON → ParsedConversation.
 *
 * The share endpoint (`/backend-api/share/<id>`) returns a conversation tree in
 * `mapping` (node id → { message, parent, children }) plus a `title` and
 * `default_model_slug`. We walk the tree from the root following children and
 * keep only visible user/assistant text turns.
 */

import type { ParsedConversation, ParsedMessage } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Known artifacts ChatGPT injects as pseudo user-turns in shared exports.
const USER_ARTIFACTS = new Set(['original custom instructions no longer available'])

function extractText(message: any): string {
  const content = message?.content
  if (!content) return ''
  const ct = content.content_type
  if (ct !== 'text' && ct !== 'multimodal_text') return ''
  const parts = Array.isArray(content.parts) ? content.parts : []
  // multimodal_text parts mix strings with image-pointer objects; keep the strings.
  return parts
    .filter((p: unknown) => typeof p === 'string')
    .join('\n')
    .trim()
}

export function parseChatGPT(json: any, url: string): ParsedConversation {
  const warnings: string[] = []
  const mapping = (json && json.mapping) || {}

  // Find the root node (no parent).
  let rootId: string | null = null
  for (const [id, node] of Object.entries<any>(mapping)) {
    if (node && !node.parent) {
      rootId = id
      break
    }
  }

  // Depth-first walk following children to recover display order.
  const ordered: any[] = []
  const seen = new Set<string>()
  const visit = (id: string | null | undefined): void => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const node = mapping[id]
    if (!node) return
    if (node.message) ordered.push(node.message)
    const children = Array.isArray(node.children) ? node.children : []
    for (const child of children) visit(child)
  }
  visit(rootId)

  const messages: ParsedMessage[] = []
  let model = ''
  for (const m of ordered) {
    const role = m?.author?.role
    if (role !== 'user' && role !== 'assistant') continue
    // Skip tool/analysis channels — only messages addressed to "all" are visible.
    if (m?.recipient && m.recipient !== 'all') continue
    const text = extractText(m)
    if (!text) continue
    if (role === 'user' && USER_ARTIFACTS.has(text.toLowerCase())) continue
    if (role === 'assistant' && !model && typeof m?.metadata?.model_slug === 'string') {
      model = m.metadata.model_slug
    }
    // Both share payloads and account exports date messages in epoch seconds.
    const createdAt = typeof m?.create_time === 'number' ? new Date(m.create_time * 1000).toISOString() : ''
    messages.push({
      role,
      text,
      ...(typeof m?.id === 'string' && m.id ? { id: m.id } : {}),
      ...(createdAt ? { createdAt } : {}),
    })
  }

  if (!model && typeof json?.default_model_slug === 'string') {
    model = json.default_model_slug
  }

  const title = typeof json?.title === 'string' ? json.title.trim() : ''
  // Account exports carry the conversation id; share payloads usually do not.
  const sourceId =
    (typeof json?.conversation_id === 'string' && json.conversation_id) ||
    (typeof json?.id === 'string' && json.id) ||
    ''
  // Exports use epoch seconds for create_time.
  const createdAt =
    typeof json?.create_time === 'number' ? new Date(json.create_time * 1000).toISOString() : ''

  return {
    provider: 'chatgpt',
    url,
    title,
    model,
    messages,
    warnings,
    ...(sourceId ? { sourceId } : {}),
    ...(createdAt ? { createdAt } : {}),
  }
}
