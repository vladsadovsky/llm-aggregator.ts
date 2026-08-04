import { describe, expect, it } from 'vitest'
import type { QAPairData } from '../../electron/services/qaPairService'
import {
  buildQASearchIndex,
  removeFromQASearchIndex,
  searchQASearchIndex,
  updateQASearchIndex,
} from '../../electron/services/persistence/qaSearchIndex'

function pair(id: string, overrides: Partial<QAPairData> = {}): QAPairData {
  return {
    id,
    filepath: `/archive/${id}.md`,
    title: 'Untitled',
    source: 'manual',
    url: '',
    tags: [],
    timestamp: '',
    version: 0,
    threadPairs: [],
    question: '',
    answer: '',
    ...overrides,
  }
}

describe('Q&A search index', () => {
  it('preserves case-insensitive substring search and archive insertion order', () => {
    const index = buildQASearchIndex({
      first: pair('first', { title: 'Vector Search', question: 'How do indexes work?' }),
      second: pair('second', { answer: 'A vector is a mathematical object.' }),
      third: pair('third', { tags: ['Performance', 'Vue'] }),
    })

    expect(searchQASearchIndex(index, 'VECT', 'full-text')).toEqual(['first', 'second'])
    expect(searchQASearchIndex(index, 'form', 'tags')).toEqual(['third'])
  })

  it('keeps search material correct after a pair is updated or deleted', () => {
    const index = buildQASearchIndex({ old: pair('old', { title: 'Old title', tags: ['old'] }) })
    const updated = pair('old', { title: 'New title', tags: ['fresh'] })

    updateQASearchIndex(index, updated)
    expect(searchQASearchIndex(index, 'old', 'full-text')).toEqual([])
    expect(searchQASearchIndex(index, 'fresh', 'tags')).toEqual(['old'])

    removeFromQASearchIndex(index, 'old')
    expect(searchQASearchIndex(index, 'new', 'full-text')).toEqual([])
  })
})
