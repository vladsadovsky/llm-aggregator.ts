/**
 * Unit tests for the bulk ("account export") import layer.
 * Most modules under test are pure (no Electron / filesystem), so they run
 * directly under the Node vitest config. The `commitArchiveImport` tests at
 * the bottom are the exception — that function writes through threadService /
 * qaPairService, so those two plus duplicateService's origin index are mocked
 * out below to keep the whole file filesystem-free.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  parseClaudeMessages,
  extractClaudeText,
  claudeSkipWarnings,
} from '../../electron/services/import/parsers/claudeMessages'
import {
  parseClaudeAccountExport,
  looksLikeClaudeAccountExport,
} from '../../electron/services/import/archive/parsers/claudeAccountExport'
import {
  parseGeminiTakeout,
  looksLikeGeminiTakeout,
  looksLikeGeminiTakeoutHtml,
  looksLikeGeminiTakeoutJson,
} from '../../electron/services/import/archive/parsers/geminiTakeout'
import {
  parseCopilotCsv,
  looksLikeCopilotCsv,
  parseCsvRows,
} from '../../electron/services/import/archive/parsers/copilotCsv'
import {
  detectArchiveFormat,
  ARCHIVE_FORMATS,
  CANDIDATE_ENTRY_NAMES,
  UNSUPPORTED_HINTS,
} from '../../electron/services/import/archive/formatRegistry'
import { pairMessages } from '../../electron/services/import/pairMessages'
import { buildResult, buildOriginId } from '../../electron/services/import/buildResult'
import { parseClaude } from '../../electron/services/import/parsers/claudeParser'
import { fingerprintPair } from '../../electron/services/duplicateService'
import { commitArchiveImport } from '../../electron/services/import/archive/bulkImportService'
import type { BulkImportPreview, BulkImportThread } from '../../electron/services/import/archive/archiveTypes'

// commitArchiveImport writes real files via these three modules — mock them so
// the test stays in-memory. duplicateService keeps its real fingerprintPair
// export (used above) and only buildOriginIndex is replaced.
const savedThreadsCalls: Array<Record<string, { name: string; items: string[] }>> = []
let createdPairCounter = 0

vi.mock('../../electron/services/threadService', () => ({
  loadThreads: vi.fn(() => ({})),
  saveThreads: vi.fn((threads: Record<string, { name: string; items: string[] }>) => {
    savedThreadsCalls.push(threads)
  }),
}))

vi.mock('../../electron/services/qaPairService', () => ({
  createPair: vi.fn((data: { title: string; source: string; url: string; tags: string[]; question: string; answer: string; originId?: string }) => ({
    id: `pair_${createdPairCounter++}`,
    filepath: '',
    title: data.title,
    source: data.source,
    url: data.url,
    tags: data.tags,
    timestamp: new Date().toISOString(),
    version: 0,
    threadPairs: [],
    question: data.question,
    answer: data.answer,
    ...(data.originId ? { originId: data.originId } : {}),
  })),
}))

vi.mock('../../electron/services/duplicateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/services/duplicateService')>()
  return { ...actual, buildOriginIndex: vi.fn(() => new Map()) }
})

/** One BulkImportThread with `count` items, all with a distinct originId. */
function makeThread(sourceId: string, count: number): BulkImportThread {
  return {
    sourceId,
    name: `Thread ${sourceId}`,
    nameWasDerived: false,
    tags: [],
    items: Array.from({ length: count }, (_, i) => ({
      data: {
        title: `${sourceId} item ${i}`,
        source: 'gemini',
        url: '',
        tags: [],
        question: `Q${i}`,
        answer: `A${i}`,
      },
      warnings: [],
    })),
    createdAt: '2026-07-26T00:00:00.000Z',
    warnings: [],
    duplicateCount: 0,
  }
}

function makePreview(threads: BulkImportThread[]): BulkImportPreview {
  return {
    format: 'gemini-takeout',
    formatLabel: 'Gemini (Google Takeout activity)',
    provider: 'gemini',
    sourcePath: '/fake/export.zip',
    sourceEntry: 'MyActivity.json',
    threads,
    totalPairs: threads.reduce((sum, t) => sum + t.items.length, 0),
    duplicatePairs: 0,
    dateRange: { from: '', to: '' },
    warnings: [],
  }
}

describe('extractClaudeText', () => {
  it('prefers typed text blocks over the flat text field', () => {
    // Account exports pollute `text` with placeholders where tool blocks were.
    const message = {
      text: '```\nThis block is not supported on your current device yet.\n```\n\nReal answer.',
      content: [
        { type: 'thinking', thinking: 'hidden' },
        { type: 'text', text: 'Real answer.' },
        { type: 'tool_use', name: 'search' },
        { type: 'tool_result', content: 'x' },
        { type: 'token_budget', value: 1 },
      ],
    }
    expect(extractClaudeText(message)).toBe('Real answer.')
  })

  it('falls back to the flat text field when content is null (snapshot shape)', () => {
    expect(extractClaudeText({ text: 'Flat text', content: null })).toBe('Flat text')
  })

  it('returns empty string for tool-only turns', () => {
    expect(extractClaudeText({ text: '', content: [{ type: 'tool_use' }] })).toBe('')
  })
})

describe('parseClaudeMessages', () => {
  it('orders by index when present (snapshot shape)', () => {
    const { messages } = parseClaudeMessages([
      { index: 2, sender: 'human', text: 'Q2', uuid: 'm3' },
      { index: 0, sender: 'human', text: 'Q1', uuid: 'm1' },
      { index: 1, sender: 'assistant', text: 'A1', uuid: 'm2' },
    ])
    expect(messages.map((m) => m.text)).toEqual(['Q1', 'A1', 'Q2'])
    expect(messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('orders by created_at when there is no index (export shape)', () => {
    const { messages } = parseClaudeMessages([
      { sender: 'assistant', text: 'A1', created_at: '2026-01-01T00:00:02Z' },
      { sender: 'human', text: 'Q1', created_at: '2026-01-01T00:00:01Z' },
    ])
    expect(messages.map((m) => m.text)).toEqual(['Q1', 'A1'])
  })

  it('counts skipped unknown senders and empty turns', () => {
    const { messages, stats } = parseClaudeMessages([
      { sender: 'human', text: 'Q' },
      { sender: 'system', text: 'nope' },
      { sender: 'assistant', text: '', content: [] },
    ])
    expect(messages).toHaveLength(1)
    expect(stats).toEqual({ skippedUnknownRole: 1, skippedEmptyText: 1 })
    expect(claudeSkipWarnings(stats)).toHaveLength(2)
  })

  it('omits the id when the message has no uuid', () => {
    const { messages } = parseClaudeMessages([{ sender: 'human', text: 'Q' }])
    expect(messages[0].id).toBeUndefined()
  })
})

describe('looksLikeClaudeAccountExport', () => {
  const claude = [{ uuid: 'c1', name: 'Title', chat_messages: [] }]
  const chatgpt = [{ id: 'c1', title: 'Title', mapping: { root: {} } }]

  it('accepts a Claude export and rejects a ChatGPT one', () => {
    expect(looksLikeClaudeAccountExport(claude)).toBe(true)
    expect(looksLikeClaudeAccountExport(chatgpt)).toBe(false)
  })

  it('rejects non-arrays, empty arrays, and a single snapshot object', () => {
    expect(looksLikeClaudeAccountExport({})).toBe(false)
    expect(looksLikeClaudeAccountExport([])).toBe(false)
    expect(looksLikeClaudeAccountExport({ snapshot_name: 'x', chat_messages: [] })).toBe(false)
  })
})

describe('parseClaudeAccountExport', () => {
  const json = [
    {
      uuid: 'conv-1',
      name: 'First conversation',
      created_at: '2026-07-01T10:00:00Z',
      chat_messages: [
        { uuid: 'm1', sender: 'human', text: 'Q1', created_at: '2026-07-01T10:00:00Z' },
        { uuid: 'm2', sender: 'assistant', text: 'A1', created_at: '2026-07-01T10:00:05Z' },
      ],
    },
    {
      uuid: 'conv-2',
      name: '',
      created_at: '2026-07-02T10:00:00Z',
      chat_messages: [
        { uuid: 'm3', sender: 'human', text: 'Q2', created_at: '2026-07-02T10:00:00Z' },
        { uuid: 'm4', sender: 'assistant', text: 'A2', created_at: '2026-07-02T10:00:05Z' },
      ],
    },
  ]

  it('returns one conversation per entry with ids, url, and timestamps', () => {
    const convos = parseClaudeAccountExport(json)
    expect(convos).toHaveLength(2)
    expect(convos[0].provider).toBe('claude')
    expect(convos[0].sourceId).toBe('conv-1')
    expect(convos[0].title).toBe('First conversation')
    expect(convos[0].url).toBe('https://claude.ai/chat/conv-1')
    expect(convos[0].createdAt).toBe('2026-07-01T10:00:00Z')
    expect(convos[0].messages).toEqual([
      { role: 'user', text: 'Q1', id: 'm1' },
      { role: 'assistant', text: 'A1', id: 'm2' },
    ])
  })

  it('keeps conversations with no messages, flagged with a warning', () => {
    const convos = parseClaudeAccountExport([{ uuid: 'c', name: 'Empty', chat_messages: [] }])
    expect(convos).toHaveLength(1)
    expect(convos[0].messages).toEqual([])
    expect(convos[0].warnings.some((w) => /no chat_messages/i.test(w))).toBe(true)
  })

  it('returns an empty list for a non-array payload', () => {
    expect(parseClaudeAccountExport({ nope: true })).toEqual([])
  })
})

describe('parseGeminiTakeout', () => {
  // Condensed from a real Takeout MyActivity.html (Gemini Apps).
  function cell(body: string): string {
    return (
      '<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid">' +
      '<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">Gemini Apps<br></p></div>' +
      '<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">' +
      body +
      '</div></div></div>'
    )
  }

  const html =
    '<html><body><div class="mdl-grid">' +
    cell('Prompted What is a sine wave?<br>Jul 25, 2026, 11:07:57 PM PDT<br><p>A <strong>smooth</strong> wave.</p><ul><li>One</li></ul>') +
    cell('Prompted Second question<br>Jul 25, 2026, 11:30:00 PM PDT<br><p>Second answer.</p>') +
    cell('Prompted Next day question<br>Jul 27, 2026, 9:00:00 AM PDT<br><p>Next day answer.</p>') +
    cell('Created Gemini Canvas titled Something<br>Jul 27, 2026, 10:00:00 AM PDT<br>') +
    '</div></body></html>'

  it('is recognized by the registry as a Gemini Takeout page', () => {
    expect(looksLikeGeminiTakeout(html)).toBe(true)
    expect(detectArchiveFormat(html)?.id).toBe('gemini-takeout')
  })

  it('rejects a Takeout page for a different Google product', () => {
    expect(looksLikeGeminiTakeout(html.replace(/Gemini Apps/g, 'Search'))).toBe(false)
  })

  it('groups records by UTC calendar day, since Takeout has no threads', () => {
    // The first two records are 11:07 PM and 11:30 PM PDT on Jul 25, which is
    // Jul 26 in UTC — grouping is UTC so it matches the JSON variant's keys.
    const convos = parseGeminiTakeout(html)
    expect(convos).toHaveLength(2)
    expect(convos[0].title).toBe('')
    expect(convos[1].title).toBe('')
    expect(convos[0].sourceId).toBe('takeout:2026-07-26')
    expect(convos[0].provider).toBe('gemini')
    expect(convos[0].messages).toHaveLength(4) // two records × (prompt + answer)
  })

  it('converts the response HTML to Markdown', () => {
    const [day1] = parseGeminiTakeout(html)
    expect(day1.messages[0]).toMatchObject({ role: 'user', text: 'What is a sine wave?' })
    expect(day1.messages[1].text).toContain('**smooth**')
    expect(day1.messages[1].text).not.toContain('<p>')
  })

  it('skips non-conversation activity records and says so', () => {
    const convos = parseGeminiTakeout(html)
    // The "Created Canvas" record has no prompt/response pair.
    expect(convos[1].messages).toHaveLength(2)
    expect(convos[0].warnings.some((w) => /Skipped 1 non-conversation/.test(w))).toBe(true)
  })

  it('builds unique origin ids even when timestamps collide', () => {
    // Two different prompts recorded in the same second.
    const collide =
      '<html><body>' +
      cell('Prompted First<br>Jul 25, 2026, 11:07:57 PM PDT<br><p>A</p>') +
      cell('Prompted Second<br>Jul 25, 2026, 11:07:57 PM PDT<br><p>B</p>') +
      '</body></html>'
    const [convo] = parseGeminiTakeout(collide)
    const result = buildResult(convo)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].originId).not.toBe(result.items[1].originId)
  })

  it('returns an empty list when nothing matches', () => {
    expect(parseGeminiTakeout('<html><body>nothing here</body></html>')).toEqual([])
  })

  it('rejects an HTML activity page for another product that mentions Gemini', () => {
    // A YouTube page whose *content* says "Gemini Apps" must not be accepted —
    // Takeout names every product's page MyActivity.html.
    const youtube = html.replace(
      '<p class="mdl-typography--title">Gemini Apps<br></p>',
      '<p class="mdl-typography--title">YouTube<br></p>',
    )
    expect(looksLikeGeminiTakeoutHtml(youtube)).toBe(false)
    expect(detectArchiveFormat(youtube)).toBeNull()
  })
})

describe('parseGeminiTakeout — JSON variant', () => {
  const json = JSON.stringify([
    {
      header: 'Gemini Apps',
      title: 'Prompted What is a sine wave?',
      time: '2026-07-26T06:07:57.773Z',
      products: ['Gemini Apps'],
      safeHtmlItem: [{ html: '<p>A <strong>smooth</strong> wave.</p>' }],
      subtitles: [{ name: 'Question: How satisfied are you?\nAnswer: ●●○○○' }],
    },
    {
      header: 'Gemini Apps',
      title: 'Prompted Second question',
      time: '2026-07-26T07:00:00.000Z',
      safeHtmlItem: [{ html: '<p>First part.</p>' }, { html: '<p>Second part.</p>' }],
    },
    // Not a conversation.
    { header: 'Gemini Apps', title: 'Created Gemini Canvas titled Something', time: '2026-07-26T08:00:00.000Z' },
    // Image-only prompt: verb with no text.
    { header: 'Gemini Apps', title: 'Prompted ', time: '2026-07-26T09:00:00.000Z', safeHtmlItem: [{ html: '<p>x</p>' }] },
  ])

  it('is detected as the Gemini Takeout format', () => {
    expect(looksLikeGeminiTakeoutJson(json)).toBe(true)
    expect(detectArchiveFormat(json)?.id).toBe('gemini-takeout')
  })

  it('rejects another product shipping the same filename and envelope', () => {
    const youtube = JSON.stringify([
      { header: 'YouTube', title: 'Watched a video about Gemini Apps', time: '2026-07-26T06:00:00Z' },
    ])
    expect(looksLikeGeminiTakeoutJson(youtube)).toBe(false)
    expect(detectArchiveFormat(youtube)).toBeNull()
  })

  it('strips the verb, joins multiple html items, and converts to Markdown', () => {
    const [day] = parseGeminiTakeout(json)
    expect(day.messages[0]).toMatchObject({ role: 'user', text: 'What is a sine wave?' })
    expect(day.messages[1].text).toContain('**smooth**')
    expect(day.messages[3].text).toContain('First part.')
    expect(day.messages[3].text).toContain('Second part.')
  })

  it('reports non-conversation and prompt-less records separately', () => {
    const [day] = parseGeminiTakeout(json)
    expect(day.warnings.some((w) => /1 non-conversation activity record/.test(w))).toBe(true)
    expect(day.warnings.some((w) => /1 record\(s\) with no prompt text/.test(w))).toBe(true)
  })

  it('groups by UTC day and keeps the exact ISO time as createdAt', () => {
    const convos = parseGeminiTakeout(json)
    expect(convos).toHaveLength(1)
    expect(convos[0].title).toBe('')
    expect(convos[0].sourceId).toBe('takeout:2026-07-26')
    expect(convos[0].createdAt).toBe('2026-07-26T06:07:57.773Z')
  })

  it('produces the same origin id as the HTML export of the same turn', () => {
    // The JSON carries milliseconds and the HTML does not, so keys are
    // normalized to whole seconds — otherwise importing both would duplicate.
    const htmlOne =
      '<html><body><div class="outer-cell x"><div class="mdl-grid">' +
      '<div class="header-cell a"><p class="t">Gemini Apps<br></p></div>' +
      '<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">' +
      'Prompted Hello there<br>Jul 25, 2026, 11:07:57 PM PDT<br><p>Hi.</p></div></div></div></body></html>'
    const jsonOne = JSON.stringify([
      {
        header: 'Gemini Apps',
        title: 'Prompted Hello there',
        time: '2026-07-26T06:07:57.773Z',
        safeHtmlItem: [{ html: '<p>Hi.</p>' }],
      },
    ])
    const fromHtml = buildResult(parseGeminiTakeout(htmlOne)[0]).items[0].originId
    const fromJson = buildResult(parseGeminiTakeout(jsonOne)[0]).items[0].originId
    expect(fromHtml).toBe(fromJson)
    expect(fromJson).toContain('2026-07-26T06:07:57Z')
  })
})

describe('parseCopilotCsv', () => {
  // Mirrors a real privacy-dashboard export: BOM, CRLF row separators, rows
  // newest-first, and the AI reply sharing its prompt's timestamp.
  const csv =
    '﻿Conversation,Time,Author,Message\r\n' +
    '"Second Topic",2026-07-26T23:20:56,AI,"**Answer 2**\n\nWith a blank line, a comma, and ""quotes""."\r\n' +
    '"Second Topic",2026-07-26T23:20:56,Human,"Question 2"\r\n' +
    '"First Topic",2026-07-20T10:00:00,AI,"Answer 1b"\r\n' +
    '"First Topic",2026-07-20T09:00:00,Human,"Question 1b"\r\n' +
    '"First Topic",2026-07-20T08:00:00,AI,"Answer 1a"\r\n' +
    '"First Topic",2026-07-20T07:00:00,Human,"Question 1a"\r\n'

  it('is detected by its header row', () => {
    expect(looksLikeCopilotCsv(csv)).toBe(true)
    expect(detectArchiveFormat(csv)?.id).toBe('copilot-activity-csv')
  })

  it('rejects an unrelated CSV', () => {
    expect(looksLikeCopilotCsv('Name,Date,Amount\r\n"x",2026-01-01,5\r\n')).toBe(false)
    expect(detectArchiveFormat('Name,Date,Amount\r\n"x",2026-01-01,5\r\n')).toBeNull()
  })

  it('handles quoted fields with embedded newlines, commas, and doubled quotes', () => {
    const rows = parseCsvRows(csv)
    expect(rows[0]).toEqual(['Conversation', 'Time', 'Author', 'Message'])
    expect(rows[1][3]).toBe('**Answer 2**\n\nWith a blank line, a comma, and "quotes".')
  })

  it('reconstructs real threads from the Conversation column', () => {
    const convos = parseCopilotCsv(csv)
    expect(convos).toHaveLength(2)
    expect(convos.map((c) => c.title)).toEqual(['Second Topic', 'First Topic'])
    expect(convos[0].provider).toBe('copilot')
  })

  it('restores chronological order by reversing, not sorting', () => {
    // The AI row and its prompt share a timestamp, so a stable sort would leave
    // the answer ahead of the question. Reversal is what makes this correct.
    const [, first] = parseCopilotCsv(csv)
    expect(first.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(first.messages.map((m) => m.text)).toEqual([
      'Question 1a',
      'Answer 1a',
      'Question 1b',
      'Answer 1b',
    ])
  })

  it('keeps tied timestamps apart in the dedup key', () => {
    const [second] = parseCopilotCsv(csv)
    const result = buildResult(second)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].originId).toMatch(/^copilot:csv:/)
    // Prompt and reply share a timestamp but hash differently.
    expect(second.messages[0].id).not.toBe(second.messages[1].id)
  })

  it('groups untitled rows together and says so', () => {
    const untitled =
      'Conversation,Time,Author,Message\r\n' +
      ',2026-07-20T08:00:00,AI,"A"\r\n' +
      ',2026-07-20T07:00:00,Human,"Q"\r\n'
    const [convo] = parseCopilotCsv(untitled)
    expect(convo.title).toBe('')
    expect(convo.warnings.some((w) => /no conversation title/i.test(w))).toBe(true)
  })

  it('skips rows with an unknown author or empty message, and reports them', () => {
    const messy =
      'Conversation,Time,Author,Message\r\n' +
      '"T",2026-07-20T09:00:00,AI,"A"\r\n' +
      '"T",2026-07-20T08:30:00,System,"ignored"\r\n' +
      '"T",2026-07-20T08:15:00,Human,""\r\n' +
      '"T",2026-07-20T08:00:00,Human,"Q"\r\n'
    const [convo] = parseCopilotCsv(messy)
    expect(convo.messages.map((m) => m.text)).toEqual(['Q', 'A'])
    expect(convo.warnings.some((w) => /Skipped 2 row\(s\)/.test(w))).toBe(true)
  })

  it('returns an empty list for a header-only file', () => {
    expect(parseCopilotCsv('Conversation,Time,Author,Message\r\n')).toEqual([])
  })
})

describe('formatRegistry', () => {
  it('detects a Claude account export by structure, not filename', () => {
    const text = JSON.stringify([{ uuid: 'c1', name: 'T', chat_messages: [] }])
    expect(detectArchiveFormat(text)?.id).toBe('claude-account-export')
  })

  it('detects a ChatGPT account export from the same filename', () => {
    const text = JSON.stringify([{ id: 'c1', title: 'T', mapping: { root: { id: 'root' } } }])
    expect(detectArchiveFormat(text)?.id).toBe('chatgpt-account-export')
  })

  it('returns null for unrelated or malformed JSON', () => {
    expect(detectArchiveFormat('{"hello":"world"}')).toBeNull()
    expect(detectArchiveFormat('not json at all')).toBeNull()
    expect(detectArchiveFormat('')).toBeNull()
  })

  it('probes conversations.json and marks Claude as the validated format', () => {
    expect(CANDIDATE_ENTRY_NAMES).toContain('conversations.json')
    expect(ARCHIVE_FORMATS.find((f) => f.id === 'claude-account-export')?.validated).toBe(true)
    expect(ARCHIVE_FORMATS.find((f) => f.id === 'chatgpt-account-export')?.validated).toBe(false)
  })

  it('probes both Takeout entry names', () => {
    expect(CANDIDATE_ENTRY_NAMES).toContain('myactivity.html')
    expect(CANDIDATE_ENTRY_NAMES).toContain('myactivity.json')
  })

  it('recognizes unsupported exports well enough to explain them', () => {
    // The JSON variant of Takeout is recognized but not parsed.
    const takeoutJson = UNSUPPORTED_HINTS.find((h) => h.test('myactivity.json', '{}'))
    expect(takeoutJson?.message).toMatch(/HTML variant/i)
    // A Takeout page for a different product.
    const wrongProduct = UNSUPPORTED_HINTS.find((h) => h.test('myactivity.html', '<div>Search</div>'))
    expect(wrongProduct?.message).toMatch(/not for Gemini Apps/i)
    const copilot = UNSUPPORTED_HINTS.find((h) => h.test('history.csv', 'Copilot,activity'))
    expect(copilot?.message).toMatch(/Copilot/i)
  })
})

describe('pairMessages source ids', () => {
  it('carries provider message ids into each pair, anchored on the first', () => {
    const pairs = pairMessages([
      { role: 'user', text: 'Q1', id: 'm1' },
      { role: 'assistant', text: 'A1', id: 'm2' },
      { role: 'user', text: 'Q2', id: 'm3' },
      { role: 'assistant', text: 'A2', id: 'm4' },
    ])
    expect(pairs[0].sourceIds).toEqual(['m1', 'm2'])
    expect(pairs[1].sourceIds).toEqual(['m3', 'm4'])
  })

  it('yields empty sourceIds when the provider supplies no ids', () => {
    const pairs = pairMessages([
      { role: 'user', text: 'Q' },
      { role: 'assistant', text: 'A' },
    ])
    expect(pairs[0].sourceIds).toEqual([])
  })
})

describe('buildOriginId', () => {
  const convo = {
    provider: 'claude' as const,
    url: '',
    title: '',
    model: '',
    messages: [],
    warnings: [],
    sourceId: 'conv-1',
  }

  it('joins provider, conversation, and anchor message', () => {
    expect(buildOriginId(convo, ['m1', 'm2'])).toBe('claude:conv-1:m1')
  })

  it('returns empty string when either half of the key is missing', () => {
    expect(buildOriginId(convo, [])).toBe('')
    expect(buildOriginId({ ...convo, sourceId: undefined }, ['m1'])).toBe('')
  })
})

describe('buildResult origin ids', () => {
  it('stamps a stable origin id onto each imported pair', () => {
    const [convo] = parseClaudeAccountExport([
      {
        uuid: 'conv-1',
        name: 'T',
        chat_messages: [
          { uuid: 'm1', sender: 'human', text: 'Q' },
          { uuid: 'm2', sender: 'assistant', text: 'A' },
        ],
      },
    ])
    const result = buildResult(convo)
    expect(result.items[0].originId).toBe('claude:conv-1:m1')
    expect(result.items[0].data.originId).toBe('claude:conv-1:m1')
  })

  it('produces the same origin id for a share link and an export of one conversation', () => {
    // Same conversation reached two ways must dedup against itself.
    const viaSnapshot = parseClaude(
      {
        conversation_uuid: 'conv-1',
        snapshot_name: 'T',
        chat_messages: [
          { index: 0, uuid: 'm1', sender: 'human', text: 'Q' },
          { index: 1, uuid: 'm2', sender: 'assistant', text: 'A' },
        ],
      },
      'https://claude.ai/share/x',
    )
    const [viaExport] = parseClaudeAccountExport([
      {
        uuid: 'conv-1',
        name: 'T',
        chat_messages: [
          { uuid: 'm1', sender: 'human', text: 'Q' },
          { uuid: 'm2', sender: 'assistant', text: 'A' },
        ],
      },
    ])
    expect(buildResult(viaSnapshot).items[0].originId).toBe(buildResult(viaExport).items[0].originId)
  })

  it('omits origin ids when the payload carries none', () => {
    const result = buildResult({
      provider: 'chatgpt',
      url: 'u',
      title: 'T',
      model: 'm',
      messages: [
        { role: 'user', text: 'Q' },
        { role: 'assistant', text: 'A' },
      ],
      warnings: [],
    })
    expect(result.items[0].originId).toBeUndefined()
    expect(result.items[0].data.originId).toBeUndefined()
  })
})

describe('commitArchiveImport', () => {
  it('creates one distinct thread per selected conversation, not just the last', () => {
    // Regression test: generateThreadId() used to offset Date.now() by the loop
    // index in *milliseconds*, but thread ids only have second resolution — a
    // batch committed within one second (the normal case) collided on a single
    // id, and later threads silently overwrote earlier ones in threads.json.
    savedThreadsCalls.length = 0
    createdPairCounter = 0

    const threads = [makeThread('a', 2), makeThread('b', 3), makeThread('c', 1)]
    const preview = makePreview(threads)

    const result = commitArchiveImport(preview, {
      threadSourceIds: ['a', 'b', 'c'],
      skipDuplicates: false,
    })

    expect(result.createdThreads).toBe(3)
    expect(result.createdPairs).toBe(6)

    const finalThreads = savedThreadsCalls.at(-1)
    expect(finalThreads).toBeDefined()
    expect(Object.keys(finalThreads!)).toHaveLength(3)

    const itemCounts = Object.values(finalThreads!)
      .map((t) => t.items.length)
      .sort((x, y) => x - y)
    expect(itemCounts).toEqual([1, 2, 3])
  })

  it('prefixes thread names with their UTC day only when requested, and only for gemini-takeout', () => {
    savedThreadsCalls.length = 0
    createdPairCounter = 0

    const preview = makePreview([makeThread('a', 1)])
    commitArchiveImport(preview, {
      threadSourceIds: ['a'],
      skipDuplicates: false,
      includeDateInThreadNames: true,
    })

    const finalThreads = savedThreadsCalls.at(-1)!
    const names = Object.values(finalThreads).map((t) => t.name)
    expect(names).toEqual(['2026-07-26 — Thread a'])
  })
})

describe('fingerprintPair', () => {
  it('collides for pairs differing only by formatting and case', () => {
    const a = fingerprintPair({ question: 'What is **X**?', answer: 'It   is a thing.' })
    const b = fingerprintPair({ question: 'what is X?', answer: 'It is a thing.' })
    expect(a).toBe(b)
  })

  it('differs when the content differs', () => {
    const a = fingerprintPair({ question: 'What is X?', answer: 'A thing.' })
    const b = fingerprintPair({ question: 'What is Y?', answer: 'A thing.' })
    expect(a).not.toBe(b)
  })
})
