/**
 * import/pairMessages.ts
 * Pure: flat message list → QA pairs.
 *
 * A pair is one-or-more consecutive user messages (the question) followed by
 * one-or-more consecutive assistant messages (the answer). A new user message
 * after an answer starts the next pair. Leading assistant messages (before any
 * user turn) produce a pair with an empty question and a warning.
 */

import type { ParsedMessage } from './types'

export interface RawPair {
  question: string
  answer: string
  warnings: string[]
  /**
   * Provider-side message ids that went into this pair, in order. The first
   * entry is the pair's stable anchor for dedup keys. Empty when the provider
   * payload carries no message ids.
   */
  sourceIds: string[]
}

export function pairMessages(messages: ParsedMessage[]): RawPair[] {
  const pairs: RawPair[] = []
  let curQ: string[] = []
  let curA: string[] = []
  let curIds: string[] = []
  let collectingAnswer = false

  const flush = (): void => {
    if (curQ.length === 0 && curA.length === 0) return
    const question = curQ.join('\n\n').trim()
    const answer = curA.join('\n\n').trim()
    const warnings: string[] = []
    if (!question) warnings.push('No question detected for this pair (leading assistant message).')
    if (!answer) warnings.push('No answer detected for this pair.')
    pairs.push({ question, answer, warnings, sourceIds: curIds })
    curQ = []
    curA = []
    curIds = []
  }

  for (const m of messages) {
    if (m.role === 'user') {
      if (collectingAnswer) flush()
      curQ.push(m.text)
      collectingAnswer = false
    } else {
      curA.push(m.text)
      collectingAnswer = true
    }
    if (m.id) curIds.push(m.id)
  }
  flush()

  return pairs
}
