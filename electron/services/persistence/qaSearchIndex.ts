import type { QAPairData } from '../qaPairService'

/**
 * Normalized search material built once for an archive snapshot. Keeping this
 * separate from the renderer-facing pair map avoids lower-casing and joining
 * every Q&A body again for each debounced keystroke.
 */
export interface QASearchIndex {
  fullText: Map<string, string>
  tags: Map<string, string[]>
}

export function buildQASearchIndex(pairs: Record<string, QAPairData>): QASearchIndex {
  const fullText = new Map<string, string>()
  const tags = new Map<string, string[]>()

  for (const [id, pair] of Object.entries(pairs)) {
    fullText.set(id, `${pair.title} ${pair.question} ${pair.answer}`.toLowerCase())
    tags.set(id, pair.tags.map((tag) => tag.toLowerCase()))
  }

  return { fullText, tags }
}

export function updateQASearchIndex(index: QASearchIndex, pair: QAPairData): void {
  index.fullText.set(pair.id, `${pair.title} ${pair.question} ${pair.answer}`.toLowerCase())
  index.tags.set(pair.id, pair.tags.map((tag) => tag.toLowerCase()))
}

export function removeFromQASearchIndex(index: QASearchIndex, id: string): void {
  index.fullText.delete(id)
  index.tags.delete(id)
}

/** Preserve the historical case-insensitive substring matching semantics. */
export function searchQASearchIndex(index: QASearchIndex, query: string, type: 'full-text' | 'tags'): string[] {
  const lowerQuery = query.toLowerCase()
  const results: string[] = []

  if (type === 'tags') {
    for (const [id, tags] of index.tags) {
      if (tags.some((tag) => tag.includes(lowerQuery))) results.push(id)
    }
  } else {
    for (const [id, text] of index.fullText) {
      if (text.includes(lowerQuery)) results.push(id)
    }
  }

  return results
}
