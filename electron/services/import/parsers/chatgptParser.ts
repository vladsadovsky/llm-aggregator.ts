/**
 * import/parsers/chatgptParser.ts
 * Pure: a single ChatGPT conversation object → ParsedConversation.
 *
 * Handles BOTH payload shapes, which differ in one crucial way:
 *  - **Share API** (`/backend-api/share/<id>`): `mapping` nodes carry populated
 *    `children` arrays.
 *  - **Account export** (`conversations-NNN.json`): `children` arrays are EMPTY;
 *    the tree exists only as `parent` pointers plus a `current_node`.
 *
 * So we recover order by walking the **active branch** from `current_node` up to
 * the root via `parent`, then reversing — which works for both. A
 * reconstruct-children fallback covers payloads with no `current_node`.
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

/**
 * Recover conversation order from a `mapping` tree.
 *
 * Primary: walk the active branch from `current_node` up to the root via
 * `parent`, then reverse. This is the branch the user actually sees, and — key
 * for account exports — it does not rely on `children`, which exports leave empty.
 *
 * Fallback (no usable `current_node`): rebuild the child map from `parent`
 * pointers (merging any explicit `children`), then depth-first from the root.
 */
function orderMessages(mapping: Record<string, any>, currentNode: unknown): any[] {
  if (typeof currentNode === 'string' && mapping[currentNode]) {
    const chain: any[] = []
    const seen = new Set<string>()
    let id: string | null | undefined = currentNode
    while (id && mapping[id] && !seen.has(id)) {
      seen.add(id)
      const node: any = mapping[id]
      if (node.message) chain.push(node.message)
      id = node.parent
    }
    if (chain.length > 0) {
      chain.reverse()
      return chain
    }
  }

  const childrenOf = new Map<string, string[]>()
  let rootId: string | null = null
  for (const [id, node] of Object.entries<any>(mapping)) {
    const parent = node?.parent
    if (typeof parent === 'string' && parent) {
      const arr = childrenOf.get(parent) ?? []
      arr.push(id)
      childrenOf.set(parent, arr)
    } else if (!parent) {
      rootId = id
    }
    if (Array.isArray(node?.children)) {
      const arr = childrenOf.get(id) ?? []
      for (const ch of node.children) if (typeof ch === 'string' && !arr.includes(ch)) arr.push(ch)
      childrenOf.set(id, arr)
    }
  }

  const ordered: any[] = []
  const seen = new Set<string>()
  const visit = (id: string | null | undefined): void => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const node = mapping[id]
    if (!node) return
    if (node.message) ordered.push(node.message)
    for (const child of childrenOf.get(id) ?? []) visit(child)
  }
  visit(rootId)
  return ordered
}

export function parseChatGPT(json: any, url: string): ParsedConversation {
  const warnings: string[] = []
  const mapping = (json && json.mapping) || {}

  const ordered = orderMessages(mapping, json?.current_node)

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
