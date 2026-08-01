/**
 * Phase 0.5 — pure, deterministic query/filter engine.
 *
 * A serializable query AST (source set, UTC date range, tag set with explicit
 * all/any, URL presence, normalized full text) is validated with zod, then
 * compiled once into a predicate over a read-only QA projection. It is
 * dependency-free of Electron/Pinia/DOM so both the renderer (advanced filters)
 * and main can reuse it, and Phase 3 "virtual threads" is just a saved query.
 *
 * Determinism guarantees (pinned by tests):
 *  - No user string is ever compiled into a RegExp (no ReDoS surface); text and
 *    tag matching use NFKC normalization + locale-independent case folding and
 *    substring/equality only.
 *  - An empty query ({}) is the identity filter (matches every pair).
 *  - A date-range filter compares the pair's UTC *calendar day*; a pair with a
 *    missing/invalid timestamp never matches a date range.
 *  - `evaluateQuery` returns ids in a stable order: timestamp descending, ties
 *    broken by id ascending, invalid/missing timestamps last.
 */
import { z } from 'zod'

// ─── Read-only projection the engine evaluates against ───────────────────────

/** The minimal, read-only view of a QA pair the engine needs. QAPairData is structurally assignable. */
export interface QueryablePair {
  id: string
  source: string
  tags: string[]
  timestamp: string
  url: string
  title: string
  question: string
  answer: string
}

// ─── AST + validation ────────────────────────────────────────────────────────

const MAX_TEXT = 1000
const MAX_SOURCES = 50
const MAX_TAGS = 100
const MAX_TERM = 64
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const boundedTerm = z.string().trim().min(1).max(MAX_TERM)

export const QuerySchema = z
  .object({
    text: z.string().max(MAX_TEXT).optional(),
    sources: z.array(boundedTerm).min(1).max(MAX_SOURCES).optional(),
    tags: z
      .object({
        mode: z.enum(['all', 'any']),
        values: z.array(boundedTerm).min(1).max(MAX_TAGS),
      })
      .strict()
      .optional(),
    dateRange: z
      .object({
        from: z.string().regex(ISO_DAY, 'expected YYYY-MM-DD').optional(),
        to: z.string().regex(ISO_DAY, 'expected YYYY-MM-DD').optional(),
      })
      .strict()
      .refine((r) => r.from !== undefined || r.to !== undefined, 'dateRange needs from or to')
      .refine((r) => !(r.from && r.to) || r.from <= r.to, 'from must be <= to')
      .optional(),
    hasUrl: z.boolean().optional(),
  })
  .strict()

export type Query = z.infer<typeof QuerySchema>

/** Validate untrusted input into a Query, throwing a ZodError on any violation. */
export function parseQuery(input: unknown): Query {
  return QuerySchema.parse(input)
}

// ─── Normalization (no locale, no regex-from-input) ──────────────────────────

/** NFKC + locale-independent case fold. Used for text, sources, and tags alike. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
}

/** The pair's UTC calendar day as YYYY-MM-DD, or null if the timestamp is missing/invalid. */
export function toUtcDay(timestamp: string): string | null {
  const t = Date.parse(timestamp)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

// ─── Compilation ─────────────────────────────────────────────────────────────

/** Compile a validated query into a pure predicate. An empty query matches every pair. */
export function compileQuery(query: Query): (pair: QueryablePair) => boolean {
  const checks: Array<(pair: QueryablePair) => boolean> = []

  if (query.text !== undefined) {
    const needle = normalizeText(query.text).trim()
    if (needle.length > 0) {
      checks.push((p) => normalizeText(`${p.title} ${p.question} ${p.answer}`).includes(needle))
    }
    // A blank/whitespace-only text term is a no-op, not a match-nothing filter.
  }

  if (query.sources !== undefined) {
    const allowed = new Set(query.sources.map(normalizeText))
    checks.push((p) => allowed.has(normalizeText(p.source)))
  }

  if (query.tags !== undefined) {
    const wanted = query.tags.values.map(normalizeText)
    const mode = query.tags.mode
    checks.push((p) => {
      const have = new Set(p.tags.map(normalizeText))
      return mode === 'all' ? wanted.every((t) => have.has(t)) : wanted.some((t) => have.has(t))
    })
  }

  if (query.dateRange !== undefined) {
    const { from, to } = query.dateRange
    checks.push((p) => {
      const day = toUtcDay(p.timestamp)
      if (day === null) return false // missing/invalid timestamp never matches a date range
      if (from !== undefined && day < from) return false
      if (to !== undefined && day > to) return false
      return true
    })
  }

  if (query.hasUrl !== undefined) {
    const want = query.hasUrl
    checks.push((p) => p.url.trim().length > 0 === want)
  }

  return (pair) => checks.every((check) => check(pair))
}

// ─── Evaluation with deterministic ordering ──────────────────────────────────

/**
 * Compile and evaluate a query against a set of pairs, returning matching ids in
 * a stable, deterministic order: timestamp descending, ties broken by id
 * ascending, with missing/invalid timestamps sorted last.
 */
export function evaluateQuery(query: Query, pairs: readonly QueryablePair[]): string[] {
  const predicate = compileQuery(query)
  return pairs
    .filter(predicate)
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      const va = Number.isNaN(ta)
      const vb = Number.isNaN(tb)
      if (va !== vb) return va ? 1 : -1 // invalid timestamps last
      if (!va && ta !== tb) return tb - ta // newer first
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // stable tiebreak by id
    })
    .map((p) => p.id)
}
