/**
 * Issue #18 — a QA or thread exported by this app could not be reimported by
 * the same version of the app. Root cause: the export format used a bare
 * `---` line as the boundary between QA blocks in a thread export, but `---`
 * is also the single most common Markdown horizontal rule — real LLM answers
 * routinely contain one as a section divider. Any embedded `---` silently
 * truncated the answer and split the remainder into a bogus, empty QA block,
 * for both thread exports *and* single-QA exports (there is no separator to
 * be ambiguous about, but the same split function ran over the body anyway).
 *
 * There was no test — round-tripping the app's own export format was never
 * exercised end-to-end. These tests pin the fix (an unambiguous HTML-comment
 * marker for schema_version 2+) and the schema_version 1 fallback behaviour.
 */
import { describe, it, expect } from 'vitest'
import {
  formatQAExport,
  formatThreadExport,
  SCHEMA_VERSION,
} from '../../electron/services/qaExportFormatService'
import { parseImportFile } from '../../electron/services/qaImportFormatService'
import type { QAPairData } from '../../electron/services/qaPairService'
import type { ThreadData } from '../../electron/services/threadService'

function makePair(overrides: Partial<QAPairData> = {}): QAPairData {
  return {
    id: '20260204_2135',
    filepath: '/tmp/x.md',
    title: 'My Title',
    source: 'manual',
    url: '',
    tags: ['foo', 'bar'],
    timestamp: '2026-02-04T21:35:57.826479',
    version: 1,
    threadPairs: [],
    question: 'What is the answer to life?',
    answer: 'The answer is 42.',
    ...overrides,
  }
}

describe('export/import round trip', () => {
  it('single QA round-trips cleanly', () => {
    const pair = makePair()
    const result = parseImportFile(formatQAExport(pair))

    expect(result.exportType).toBe('qa')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].data.title).toBe(pair.title)
    expect(result.items[0].data.question).toBe(pair.question)
    expect(result.items[0].data.answer).toBe(pair.answer)
    expect(result.fileWarnings).toEqual([])
    expect(result.items[0].warnings).toEqual([])
  })

  it('a thread with several QAs round-trips cleanly', () => {
    const p1 = makePair({ id: 'a', title: 'First' })
    const p2 = makePair({ id: 'b', title: 'Second' })
    const p3 = makePair({ id: 'c', title: 'Third' })
    const thread: ThreadData = { name: 'My Thread', items: ['a', 'b', 'c'] }
    const result = parseImportFile(formatThreadExport(thread, { a: p1, b: p2, c: p3 }))

    expect(result.exportType).toBe('thread')
    expect(result.threadName).toBe('My Thread')
    expect(result.items).toHaveLength(3)
    expect(result.items.map((i) => i.data.title)).toEqual(['First', 'Second', 'Third'])
    expect(result.items.every((i) => i.warnings.length === 0)).toBe(true)
  })

  it('regression: a single QA whose answer contains a Markdown horizontal rule round-trips whole', () => {
    const answer =
      'Broadly, I can take on these kinds of "personalities":\n\n' +
      '---\n\n### 1. Analytical\n- precise, sourced\n\n---\n\n### 2. Technical Mentor\n- step by step'
    const pair = makePair({ answer })
    const result = parseImportFile(formatQAExport(pair))

    expect(result.items).toHaveLength(1)
    expect(result.items[0].data.answer).toBe(answer)
    expect(result.items[0].warnings).toEqual([])
  })

  it('regression: a thread QA whose answer contains a Markdown horizontal rule does not corrupt neighboring QAs', () => {
    const answerWithRule =
      'Command breakdown:\n\n```bash\nexiftool -v3 file.jpg\n```\n\n---\n\n' +
      '### Summary\n- point one\n- point two\n\n---\n\nWant to go deeper?'
    const p1 = makePair({ id: 'a', title: 'First', answer: answerWithRule })
    const p2 = makePair({ id: 'b', title: 'Second', answer: 'Plain answer, no rules.' })
    const p3 = makePair({ id: 'c', title: 'Third', answer: 'Another plain answer.' })
    const thread: ThreadData = { name: 'Thread With Rules', items: ['a', 'b', 'c'] }
    const result = parseImportFile(formatThreadExport(thread, { a: p1, b: p2, c: p3 }))

    expect(result.items).toHaveLength(3)
    expect(result.items[0].data.answer).toBe(answerWithRule)
    expect(result.items[1].data.title).toBe('Second')
    expect(result.items[2].data.title).toBe('Third')
    expect(result.items.every((i) => i.warnings.length === 0)).toBe(true)
  })

  it('schema_version 2 files never fall back to the fragile legacy splitter', () => {
    const pair = makePair({ answer: 'line one\n\n---\n\nline two\n\n---\n\nline three' })
    const exported = formatQAExport(pair)
    expect(exported).toContain(`schema_version: ${SCHEMA_VERSION}`)
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2)

    const result = parseImportFile(exported)
    expect(result.items).toHaveLength(1)
  })

  it('legacy schema_version 1 thread export (bare --- separator, no embedded rules) still imports', () => {
    // Simulates a pre-fix export: no QA_BLOCK_SEPARATOR marker present at all.
    const legacy = [
      '---',
      'writer_app: llm-aggregator',
      'writer_version: 1.3.2',
      'schema_version: 1',
      'exported_at: 2026-07-01T00:00:00.000Z',
      'export_type: thread',
      'thread_name: Legacy Thread',
      '---',
      '',
      'title: First',
      'source: manual',
      'url: ',
      'tags: ',
      'version: 1',
      'original_id: a',
      'original_timestamp: 2026-01-01T00:00:00.000Z',
      '',
      '## Question',
      '',
      'Q1',
      '',
      '## Answer',
      '',
      'A1 with no embedded rules.',
      '',
      '---',
      '',
      'title: Second',
      'source: manual',
      'url: ',
      'tags: ',
      'version: 1',
      'original_id: b',
      'original_timestamp: 2026-01-01T00:00:00.000Z',
      '',
      '## Question',
      '',
      'Q2',
      '',
      '## Answer',
      '',
      'A2 with no embedded rules.',
      '',
    ].join('\n')

    const result = parseImportFile(legacy)
    expect(result.exportType).toBe('thread')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].data.title).toBe('First')
    expect(result.items[1].data.title).toBe('Second')
  })
})
