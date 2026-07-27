/**
 * import/buildResult.ts
 * Pure: ParsedConversation → SharedImportResult.
 *
 * Owns the non-transport decisions: model label, thread name + whether it was
 * derived, provider/model tags, and per-QA titles. Kept pure so it can be
 * unit-tested without Electron.
 */

import type { ParsedConversation, SharedImportResult, SharedImportQA } from './types'
import { PROVIDER_LABEL, PROVIDER_SOURCE, normalizeTag } from './providerDetection'
import { pairMessages } from './pairMessages'

// Titles that shared pages fall back to when there is no real conversation name.
const GENERIC_TITLES = new Set([
  '',
  'new chat',
  'untitled',
  'chatgpt',
  'gemini',
  'copilot',
  'microsoft copilot',
  'claude',
])

/** First non-empty line of `text`, trimmed to `max` chars. */
export function deriveTitle(text: string, max = 70): string {
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!firstLine) return ''
  if (firstLine.length <= max) return firstLine
  return firstLine.slice(0, max).replace(/\s+\S*$/, '').trim() + '…'
}

/**
 * Stable cross-import identity for one pair: `<provider>:<conversationId>:<anchorMessageId>`.
 *
 * The anchor is the pair's first provider-side message id, so the key survives
 * later turns being appended to the same conversation. Returns '' when the
 * payload carries no conversation id or no message ids — callers then fall back
 * to content-based duplicate detection.
 */
export function buildOriginId(convo: ParsedConversation, sourceIds: string[]): string {
  const conversationId = (convo.sourceId ?? '').trim()
  const anchor = sourceIds[0]
  if (!conversationId || !anchor) return ''
  return `${convo.provider}:${conversationId}:${anchor}`
}

export interface BuildResultOptions {
  /**
   * Tags applied on top of the provider/model ones, e.g. `bulk` for account-export
   * imports so those threads and pairs can be filtered as a batch afterwards.
   */
  extraTags?: string[]
}

/** Earliest / latest message time in a conversation. '' when the payload has no times. */
function messageTimeRange(convo: ParsedConversation): { createdAt: string; updatedAt: string } {
  // ISO strings compare lexicographically, and every parser normalizes to UTC ISO.
  let createdAt = ''
  let updatedAt = ''
  for (const m of convo.messages) {
    if (!m.createdAt) continue
    if (!createdAt || m.createdAt < createdAt) createdAt = m.createdAt
    if (!updatedAt || m.createdAt > updatedAt) updatedAt = m.createdAt
  }
  // Fall back to the conversation-level time when messages carry none.
  const fallback = convo.createdAt ?? ''
  return { createdAt: createdAt || fallback, updatedAt: updatedAt || createdAt || fallback }
}

export function buildResult(convo: ParsedConversation, options: BuildResultOptions = {}): SharedImportResult {
  const providerLabel = PROVIDER_LABEL[convo.provider]
  const model = convo.model.trim() || providerLabel

  // Tags: provider name + model name + any caller-supplied extras (deduped, non-empty).
  const tags = Array.from(
    new Set(
      [normalizeTag(providerLabel), normalizeTag(model), ...(options.extraTags ?? []).map(normalizeTag)].filter(
        Boolean,
      ),
    ),
  )

  const pairs = pairMessages(convo.messages)
  const firstQuestion = pairs.find((p) => p.question)?.question ?? ''

  // Thread name: real title if we found one, otherwise derive from the first question.
  const detectedTitle = convo.title.trim()
  const titleIsGeneric = GENERIC_TITLES.has(detectedTitle.toLowerCase())
  const titleWasDerived = titleIsGeneric
  const derivedName = deriveTitle(firstQuestion) || `Imported ${providerLabel} conversation`
  const threadName = titleWasDerived ? derivedName : detectedTitle

  const items: SharedImportQA[] = pairs.map((pair, i) => {
    const title = deriveTitle(pair.question) || deriveTitle(pair.answer) || `${threadName} — part ${i + 1}`
    const originId = buildOriginId(convo, pair.sourceIds)
    // Prefer the pair's own message time; fall back to the conversation's so a
    // provider that only dates the conversation still beats "time of import".
    const timestamp = pair.createdAt || convo.createdAt || ''
    return {
      data: {
        title,
        source: PROVIDER_SOURCE[convo.provider],
        url: convo.url,
        tags: [...tags],
        question: pair.question,
        answer: pair.answer,
        ...(originId ? { originId } : {}),
        ...(timestamp ? { timestamp } : {}),
      },
      warnings: pair.warnings,
      ...(originId ? { originId } : {}),
    }
  })

  const warnings = [...convo.warnings]
  if (titleWasDerived) {
    warnings.push(
      `No conversation title was found — the thread was named "${threadName}". Please rename it to something meaningful.`,
    )
  }

  const { createdAt, updatedAt } = messageTimeRange(convo)

  return {
    provider: convo.provider,
    url: convo.url,
    model,
    threadName,
    titleWasDerived,
    tags,
    items,
    warnings,
    createdAt,
    updatedAt,
  }
}
