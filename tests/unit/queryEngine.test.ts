/**
 * Phase 0.5: the query engine is pure, bounded, deterministic, and reusable.
 * These tests pin the semantics (empty-filter identity, AND/OR tags, UTC date
 * days, URL presence, Unicode/case folding), the zod bounds, deterministic
 * ordering, and the absence of any RegExp-from-input path.
 */
import { describe, it, expect } from 'vitest'
import {
  QuerySchema,
  parseQuery,
  compileQuery,
  evaluateQuery,
  normalizeText,
  toUtcDay,
  type QueryablePair,
} from '../../shared/query/queryEngine'

function pair(over: Partial<QueryablePair> & { id: string }): QueryablePair {
  return {
    source: 'claude',
    tags: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    url: '',
    title: '',
    question: '',
    answer: '',
    ...over,
  }
}

const CORPUS: QueryablePair[] = [
  pair({ id: 'a', source: 'claude', tags: ['ml', 'gpu'], timestamp: '2026-03-01T10:00:00Z', url: 'https://x', title: 'Gradient descent', question: 'how does backprop work', answer: 'chain rule' }),
  pair({ id: 'b', source: 'chatgpt', tags: ['ml'], timestamp: '2026-03-05T10:00:00Z', url: '', title: 'Adam optimizer', question: 'momentum', answer: 'moving average' }),
  pair({ id: 'c', source: 'claude', tags: ['gpu', 'cuda'], timestamp: '2026-04-10T10:00:00Z', url: '   ', title: 'CUDA kernels', question: 'warp size', answer: '32 threads' }),
]

describe('QuerySchema validation', () => {
  it('accepts an empty query', () => {
    expect(QuerySchema.safeParse({}).success).toBe(true)
  })
  it('rejects unknown fields', () => {
    expect(QuerySchema.safeParse({ bogus: 1 }).success).toBe(false)
  })
  it('rejects an empty sources array (use omission for "no constraint")', () => {
    expect(QuerySchema.safeParse({ sources: [] }).success).toBe(false)
  })
  it('rejects oversized text', () => {
    expect(QuerySchema.safeParse({ text: 'x'.repeat(1001) }).success).toBe(false)
  })
  it('rejects too many tags', () => {
    expect(QuerySchema.safeParse({ tags: { mode: 'any', values: Array(101).fill('t') } }).success).toBe(false)
  })
  it('rejects a malformed date', () => {
    expect(QuerySchema.safeParse({ dateRange: { from: '2026/01/01' } }).success).toBe(false)
  })
  it('rejects a date range with neither bound', () => {
    expect(QuerySchema.safeParse({ dateRange: {} }).success).toBe(false)
  })
  it('rejects from > to', () => {
    expect(QuerySchema.safeParse({ dateRange: { from: '2026-05-01', to: '2026-04-01' } }).success).toBe(false)
  })
  it('parseQuery throws on invalid input', () => {
    expect(() => parseQuery({ hasUrl: 'yes' })).toThrow()
  })
})

describe('compileQuery predicates', () => {
  const ids = (q: Parameters<typeof compileQuery>[0]) => CORPUS.filter(compileQuery(q)).map((p) => p.id)

  it('empty query is the identity filter (matches all)', () => {
    expect(ids({})).toEqual(['a', 'b', 'c'])
  })

  it('filters by source set (case-insensitive)', () => {
    expect(ids({ sources: ['CLAUDE'] })).toEqual(['a', 'c'])
  })

  it('full-text matches across title/question/answer, case-insensitively', () => {
    expect(ids({ text: 'BACKPROP' })).toEqual(['a'])
    expect(ids({ text: 'threads' })).toEqual(['c'])
  })

  it('blank text is a no-op, not match-nothing', () => {
    expect(ids({ text: '   ' })).toEqual(['a', 'b', 'c'])
  })

  it('tags "any" matches pairs having at least one tag', () => {
    expect(ids({ tags: { mode: 'any', values: ['gpu'] } })).toEqual(['a', 'c'])
  })

  it('tags "all" requires every tag', () => {
    expect(ids({ tags: { mode: 'all', values: ['gpu', 'cuda'] } })).toEqual(['c'])
    expect(ids({ tags: { mode: 'all', values: ['ml', 'gpu'] } })).toEqual(['a'])
  })

  it('hasUrl:true requires a non-empty (non-whitespace) url', () => {
    expect(ids({ hasUrl: true })).toEqual(['a']) // 'c' has whitespace-only url -> empty
  })

  it('hasUrl:false requires an empty/whitespace url', () => {
    expect(ids({ hasUrl: false })).toEqual(['b', 'c'])
  })

  it('date range compares the UTC calendar day, inclusively', () => {
    expect(ids({ dateRange: { from: '2026-03-01', to: '2026-03-31' } })).toEqual(['a', 'b'])
    expect(ids({ dateRange: { from: '2026-03-05', to: '2026-03-05' } })).toEqual(['b'])
  })

  it('a missing/invalid timestamp never matches a date range', () => {
    const bad = pair({ id: 'z', timestamp: 'not-a-date' })
    expect([bad].filter(compileQuery({ dateRange: { from: '2000-01-01' } })).map((p) => p.id)).toEqual([])
  })

  it('combines predicates with AND', () => {
    expect(ids({ sources: ['claude'], tags: { mode: 'any', values: ['gpu'] }, hasUrl: true })).toEqual(['a'])
  })
})

describe('normalization', () => {
  it('folds case and NFKC-normalizes compatibility forms', () => {
    // Fullwidth 'ＡＢ' -> 'ab'
    expect(normalizeText('ＡＢ')).toBe('ab')
    expect(normalizeText('Café'.normalize('NFD'))).toBe('café')
  })

  it('matches text ignoring case/width via normalization', () => {
    const p = pair({ id: 'u', title: 'ＣＵＤＡ' })
    expect(compileQuery({ text: 'cuda' })(p)).toBe(true)
  })

  it('treats punctuation literally (no regex metacharacters)', () => {
    const p = pair({ id: 'p', answer: 'cost is O(n) and a.b' })
    expect(compileQuery({ text: 'o(n)' })(p)).toBe(true)
    expect(compileQuery({ text: 'a.b' })(p)).toBe(true)
    expect(compileQuery({ text: 'axb' })(p)).toBe(false) // '.' is literal, not "any char"
  })
})

describe('toUtcDay', () => {
  it('returns the UTC day for a valid timestamp', () => {
    expect(toUtcDay('2026-04-10T23:59:00Z')).toBe('2026-04-10')
  })
  it('returns null for an invalid timestamp', () => {
    expect(toUtcDay('nonsense')).toBeNull()
  })
})

describe('evaluateQuery ordering', () => {
  it('orders matches newest-first with id tiebreak', () => {
    expect(evaluateQuery({}, CORPUS)).toEqual(['c', 'b', 'a'])
  })

  it('breaks timestamp ties by id ascending', () => {
    const tied = [
      pair({ id: 'y', timestamp: '2026-01-01T00:00:00Z' }),
      pair({ id: 'x', timestamp: '2026-01-01T00:00:00Z' }),
    ]
    expect(evaluateQuery({}, tied)).toEqual(['x', 'y'])
  })

  it('sorts invalid/missing timestamps last', () => {
    const mixed = [
      pair({ id: 'bad', timestamp: 'nope' }),
      pair({ id: 'good', timestamp: '2026-01-01T00:00:00Z' }),
    ]
    expect(evaluateQuery({}, mixed)).toEqual(['good', 'bad'])
  })

  it('is deterministic across repeated evaluations', () => {
    const once = evaluateQuery({ tags: { mode: 'any', values: ['ml', 'gpu'] } }, CORPUS)
    const twice = evaluateQuery({ tags: { mode: 'any', values: ['ml', 'gpu'] } }, CORPUS)
    expect(once).toEqual(twice)
  })
})

describe('property check vs a reference evaluator', () => {
  it('compiled predicate agrees with a naive reference for source+tag queries', () => {
    const query = { sources: ['claude'], tags: { mode: 'all' as const, values: ['gpu'] } }
    const compiled = new Set(CORPUS.filter(compileQuery(query)).map((p) => p.id))
    const reference = new Set(
      CORPUS.filter(
        (p) =>
          ['claude'].includes(p.source.toLowerCase()) &&
          ['gpu'].every((t) => p.tags.map((x) => x.toLowerCase()).includes(t)),
      ).map((p) => p.id),
    )
    expect(compiled).toEqual(reference)
  })
})

describe('no ReDoS surface', () => {
  it('handles long literal input quickly and never builds a regex', () => {
    const long = 'a'.repeat(100_000)
    const p = pair({ id: 'l', answer: long })
    const start = Date.now()
    expect(compileQuery({ text: 'aaaa' })(p)).toBe(true)
    // pathological regex-style input is matched literally, not compiled
    expect(compileQuery({ text: '(a+)+$' })(p)).toBe(false)
    expect(Date.now() - start).toBeLessThan(500)
  })
})
