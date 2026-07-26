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

export function buildResult(convo: ParsedConversation): SharedImportResult {
  const providerLabel = PROVIDER_LABEL[convo.provider]
  const model = convo.model.trim() || providerLabel

  // Tags: provider name + model name (deduped, non-empty).
  const tags = Array.from(
    new Set([normalizeTag(providerLabel), normalizeTag(model)].filter(Boolean)),
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
    return {
      data: {
        title,
        source: PROVIDER_SOURCE[convo.provider],
        url: convo.url,
        tags: [...tags],
        question: pair.question,
        answer: pair.answer,
        ...(originId ? { originId } : {}),
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

  return {
    provider: convo.provider,
    url: convo.url,
    model,
    threadName,
    titleWasDerived,
    tags,
    items,
    warnings,
  }
}
