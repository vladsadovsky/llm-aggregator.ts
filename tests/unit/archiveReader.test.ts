/**
 * The bulk-import **container / entry-selection** layer: zip reading,
 * multi-product disambiguation, folder nesting (issue #10).
 *
 * The parsers were well covered; this layer was not, and *both* bugs found
 * during development lived here — neither reachable from a pure-parser test:
 *
 *   1. A Google Takeout archive holds `My Activity/<Product>/MyActivity.json`
 *      for every product. Matching on basename and taking the first hit
 *      imported YouTube/Chrome history as Q&A pairs.
 *   2. yauzl `Entry` handles are only valid during their own `entry` event, so
 *      the original single-pass "collect handles, read later" approach threw.
 *
 * Fixtures are generated at test time (see `helpers/zipWriter.ts`) so the rules
 * they encode stay readable in the diff, and nothing binary enters git.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { writeZip } from './helpers/zipWriter'
import {
  claudeConversationsJson,
  copilotCsv,
  decoyHtml,
  geminiTakeoutHtml,
  geminiTakeoutJson,
  otherProductJson,
} from './helpers/archiveFixtures'
import { readArchiveEntry } from '../../electron/services/import/archive/archiveReader'
import {
  detectArchiveFormat,
  CANDIDATE_ENTRY_NAMES,
  ALL_PATH_HINTS,
} from '../../electron/services/import/archive/formatRegistry'

// previewArchive reaches the disk through these; keep the suite in-memory.
// Mirrors the mocks in bulkImport.test.ts.
vi.mock('../../electron/services/threadService', () => ({
  loadThreads: vi.fn(() => ({})),
  saveThreads: vi.fn(),
}))
vi.mock('../../electron/services/qaPairService', () => ({
  createPair: vi.fn(),
  listAllPairs: vi.fn(() => ({})),
}))
vi.mock('../../electron/services/duplicateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/services/duplicateService')>()
  return { ...actual, buildOriginIndex: vi.fn(() => new Map()) }
})

// Imported after the mocks so the mocked modules are the ones it binds.
const { previewArchive } = await import('../../electron/services/import/archive/bulkImportService')

/** The options previewArchive uses — detection doubles as the accept test. */
const READER_OPTIONS = {
  candidateBasenames: CANDIDATE_ENTRY_NAMES,
  pathHints: ALL_PATH_HINTS,
  accept: (text: string) => detectArchiveFormat(text) !== null,
}

let tempRoot: string

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'llm-agg-archive-'))
})

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

let counter = 0
/** A fresh path under the temp root, so no two fixtures collide. */
function fixturePath(name: string): string {
  const dir = join(tempRoot, `f${counter++}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

/** Write a nested tree of files under a fresh directory; returns that directory. */
function fixtureFolder(files: Array<{ path: string; content: string }>): string {
  const root = join(tempRoot, `d${counter++}`)
  for (const file of files) {
    const full = join(root, ...file.path.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, file.content, 'utf-8')
  }
  return root
}

const GEMINI_RECORDS = [
  { prompt: 'Explain gradient descent', response: 'It follows the negative gradient.', time: '2026-07-26T06:07:57.773Z' },
  { prompt: 'And momentum?', response: 'It accumulates a velocity term.', time: '2026-07-26T06:09:12.400Z' },
]

describe('case 1 — multi-product Takeout zip, Gemini not first', () => {
  // Ordered exactly as the bug required: several decoy products ahead of the
  // one we want, so "first basename match" picks YouTube.
  const zipPath = () =>
    writeZip(fixturePath('takeout.zip'), [
      { path: 'Takeout/archive_browser.html', content: '<html>index</html>' },
      { path: 'Takeout/My Activity/YouTube/MyActivity.json', content: otherProductJson('YouTube', 40) },
      { path: 'Takeout/My Activity/Chrome/MyActivity.json', content: otherProductJson('Chrome', 30) },
      { path: 'Takeout/My Activity/Search/MyActivity.json', content: otherProductJson('Search', 20) },
      { path: 'Takeout/My Activity/Image Search/MyActivity.json', content: otherProductJson('Image Search', 10) },
      { path: 'Takeout/My Activity/Gemini Apps/MyActivity.json', content: geminiTakeoutJson(GEMINI_RECORDS) },
      { path: 'Takeout/My Activity/Maps/MyActivity.json', content: otherProductJson('Maps', 5) },
    ])

  it('selects the Gemini entry, not the first basename match', async () => {
    const entry = await readArchiveEntry(zipPath(), READER_OPTIONS)
    expect(entry?.entryPath).toBe('Takeout/My Activity/Gemini Apps/MyActivity.json')
  })

  it('returns that entry whole — yauzl handles must not be read after their event', async () => {
    // Bug 2's signature: a deferred Entry yields nothing or throws. Assert the
    // full payload round-trips, not merely that a path was chosen.
    const entry = await readArchiveEntry(zipPath(), READER_OPTIONS)
    expect(JSON.parse(entry!.text)).toHaveLength(GEMINI_RECORDS.length)
    expect(entry!.text).toContain('Explain gradient descent')
    expect(entry!.text).not.toContain('Watched video')
  })

  it('feeds a format that parses into the expected conversations', async () => {
    const entry = await readArchiveEntry(zipPath(), READER_OPTIONS)
    const format = detectArchiveFormat(entry!.text)
    expect(format?.id).toBe('gemini-takeout')
    // Both records share a UTC day, so Takeout's day-bucketing yields one thread.
    expect(format!.parse(entry!.text)).toHaveLength(1)
  })

  it('still finds Gemini when the path hint no longer matches the folder name', async () => {
    // Correctness comes from structural detection; pathHints is only ordering,
    // so a Google rename must not break the import.
    const renamed = writeZip(fixturePath('renamed.zip'), [
      { path: 'Takeout/My Activity/YouTube/MyActivity.json', content: otherProductJson('YouTube', 40) },
      { path: 'Takeout/My Activity/Bard Archive/MyActivity.json', content: geminiTakeoutJson(GEMINI_RECORDS) },
    ])
    const entry = await readArchiveEntry(renamed, READER_OPTIONS)
    expect(entry?.entryPath).toBe('Takeout/My Activity/Bard Archive/MyActivity.json')
  })
})

describe('case 2 — HTML variant with decoy pages that mention "Gemini Apps"', () => {
  it('compares the header-cell product exactly rather than searching the text', async () => {
    const zipPath = writeZip(fixturePath('takeout-html.zip'), [
      // Both decoys contain the literal string "Gemini Apps" in their content.
      { path: 'Takeout/My Activity/YouTube/MyActivity.html', content: decoyHtml('YouTube') },
      { path: 'Takeout/My Activity/Chrome/MyActivity.html', content: decoyHtml('Chrome') },
      {
        path: 'Takeout/My Activity/Gemini Apps/MyActivity.html',
        content: geminiTakeoutHtml([
          { prompt: 'Explain gradient descent', response: 'Negative gradient.', stamp: 'Jul 25, 2026, 11:07:57 PM PDT' },
        ]),
      },
    ])

    const entry = await readArchiveEntry(zipPath, READER_OPTIONS)
    expect(entry?.entryPath).toBe('Takeout/My Activity/Gemini Apps/MyActivity.html')
    expect(entry!.text).toContain('Explain gradient descent')
  })

  it('rejects a decoy page on its own', () => {
    expect(detectArchiveFormat(decoyHtml('YouTube'))).toBeNull()
  })
})

describe('case 3 — Takeout containing only another product', () => {
  it('finds nothing rather than importing browser history', async () => {
    const zipPath = writeZip(fixturePath('youtube-only.zip'), [
      { path: 'Takeout/My Activity/YouTube/MyActivity.json', content: otherProductJson('YouTube', 40) },
      { path: 'Takeout/My Activity/YouTube/MyActivity.html', content: decoyHtml('YouTube') },
    ])
    expect(await readArchiveEntry(zipPath, READER_OPTIONS)).toBeNull()
  })

  it('explains which product is missing instead of saying "unrecognized"', async () => {
    const zipPath = writeZip(fixturePath('youtube-only-2.zip'), [
      { path: 'Takeout/My Activity/YouTube/MyActivity.json', content: otherProductJson('YouTube', 40) },
    ])
    await expect(previewArchive(zipPath)).rejects.toThrow(/Takeout|Gemini/i)
  })
})

describe('case 4 — flat zip, single conversations.json (Claude layout)', () => {
  const conversations = [
    { uuid: 'conv-1', name: 'Optimizers', turns: [{ q: 'What is Adam?', a: 'An adaptive optimizer.' }] },
    { uuid: 'conv-2', name: 'Rust borrow checker', turns: [{ q: 'Why borrow?', a: 'To prove aliasing rules.' }] },
  ]

  it('reads the simple path', async () => {
    const zipPath = writeZip(fixturePath('claude.zip'), [
      { path: 'conversations.json', content: claudeConversationsJson(conversations) },
      { path: 'projects.json', content: '[]' },
      { path: 'users.json', content: '{}' },
    ])
    const entry = await readArchiveEntry(zipPath, READER_OPTIONS)
    expect(entry?.entryPath).toBe('conversations.json')

    const format = detectArchiveFormat(entry!.text)
    expect(format?.id).toBe('claude-account-export')
    expect(format!.parse(entry!.text)).toHaveLength(2)
  })

  it('is not confused by ChatGPT shipping the same filename', async () => {
    // Three vendors ship `conversations.json` with unrelated shapes — detection
    // must key on structure, never the name.
    const zipPath = writeZip(fixturePath('chatgpt.zip'), [
      {
        path: 'conversations.json',
        content: JSON.stringify([
          {
            title: 'A ChatGPT thread',
            conversation_id: 'abc',
            create_time: 1_770_000_000,
            mapping: {
              root: { id: 'root', message: null, parent: null, children: ['m1'] },
              m1: {
                id: 'm1',
                parent: 'root',
                children: [],
                message: {
                  id: 'm1',
                  author: { role: 'user' },
                  create_time: 1_770_000_001,
                  content: { content_type: 'text', parts: ['Hello?'] },
                },
              },
            },
          },
        ]),
      },
    ])
    const entry = await readArchiveEntry(zipPath, READER_OPTIONS)
    expect(detectArchiveFormat(entry!.text)?.id).toBe('chatgpt-account-export')
  })
})

describe('case 5 — deeply nested zip', () => {
  it('finds an entry regardless of depth, because zip paths are flat strings', async () => {
    const zipPath = writeZip(fixturePath('deep.zip'), [
      {
        path: 'a/b/c/d/e/f/Takeout/My Activity/Gemini Apps/MyActivity.json',
        content: geminiTakeoutJson(GEMINI_RECORDS),
      },
    ])
    const entry = await readArchiveEntry(zipPath, READER_OPTIONS)
    expect(entry?.entryPath).toContain('Gemini Apps/MyActivity.json')
  })
})

describe('case 6 — zip with no supported entry', () => {
  it('returns null from the reader', async () => {
    const zipPath = writeZip(fixturePath('unrelated.zip'), [
      { path: 'notes.txt', content: 'nothing to see' },
      { path: 'photos/img.json', content: '{"exif":true}' },
    ])
    expect(await readArchiveEntry(zipPath, READER_OPTIONS)).toBeNull()
  })

  it('gives the user an actionable message, listing what is supported', async () => {
    const zipPath = writeZip(fixturePath('unrelated-2.zip'), [{ path: 'notes.txt', content: 'nothing' }])
    await expect(previewArchive(zipPath)).rejects.toThrow(/No supported conversation data/i)
  })

  it('rejects a corrupt file that only claims to be a zip', async () => {
    const bogus = fixturePath('broken.zip')
    writeFileSync(bogus, 'this is definitely not a zip archive', 'utf-8')
    await expect(readArchiveEntry(bogus, READER_OPTIONS)).rejects.toThrow(/Could not open the archive/i)
  })

  it('reports a missing path rather than failing obscurely', async () => {
    await expect(readArchiveEntry(join(tempRoot, 'does-not-exist.zip'), READER_OPTIONS)).rejects.toThrow(
      /File not found/i,
    )
  })
})

describe('case 7 — unzipped folders behave like their zips', () => {
  it('disambiguates products in a folder too (folder form of case 1)', async () => {
    const dir = fixtureFolder([
      { path: 'Takeout/My Activity/YouTube/MyActivity.json', content: otherProductJson('YouTube', 40) },
      { path: 'Takeout/My Activity/Chrome/MyActivity.json', content: otherProductJson('Chrome', 30) },
      { path: 'Takeout/My Activity/Gemini Apps/MyActivity.json', content: geminiTakeoutJson(GEMINI_RECORDS) },
    ])
    const entry = await readArchiveEntry(dir, READER_OPTIONS)
    expect(entry?.entryPath).toContain(join('Gemini Apps', 'MyActivity.json'))
    expect(entry!.text).toContain('Explain gradient descent')
  })

  it('reads a flat folder (folder form of case 4)', async () => {
    const dir = fixtureFolder([
      {
        path: 'conversations.json',
        content: claudeConversationsJson([
          { uuid: 'c1', name: 'Only', turns: [{ q: 'Q', a: 'A' }] },
        ]),
      },
    ])
    const entry = await readArchiveEntry(dir, READER_OPTIONS)
    expect(detectArchiveFormat(entry!.text)?.id).toBe('claude-account-export')
  })

  it('walks four directory levels but not five', async () => {
    // collectFolderCandidates caps depth; pin the boundary so a future change
    // to the limit is a decision rather than an accident.
    const reachable = fixtureFolder([
      { path: 'a/b/c/d/conversations.json', content: claudeConversationsJson([{ uuid: 'c', name: 'n', turns: [{ q: 'Q', a: 'A' }] }]) },
    ])
    expect(await readArchiveEntry(reachable, READER_OPTIONS)).not.toBeNull()

    const tooDeep = fixtureFolder([
      { path: 'a/b/c/d/e/conversations.json', content: claudeConversationsJson([{ uuid: 'c', name: 'n', turns: [{ q: 'Q', a: 'A' }] }]) },
    ])
    expect(await readArchiveEntry(tooDeep, READER_OPTIONS)).toBeNull()
  })
})

describe('bare files the user points at directly', () => {
  it('trusts the choice whatever it is named, and lets detection decide', async () => {
    const csvPath = fixturePath('some-download.csv')
    writeFileSync(
      csvPath,
      copilotCsv([
        { conversation: 'Topic', time: '2026-07-26T23:20:56', author: 'AI', message: 'An answer.' },
        { conversation: 'Topic', time: '2026-07-26T23:20:56', author: 'Human', message: 'A question?' },
      ]),
      'utf-8',
    )
    const entry = await readArchiveEntry(csvPath, READER_OPTIONS)
    expect(entry).not.toBeNull()
    expect(detectArchiveFormat(entry!.text)?.id).toBe('copilot-activity-csv')
  })
})

describe('opt-in checks against real account exports', () => {
  /**
   * Real exports contain account UUIDs, full names, and complete prompt
   * histories, so they must never be committed. Point this at a directory
   * holding genuine export files to verify against real data locally; CI has no
   * such directory and skips.
   *
   *   LLM_AGG_TEST_EXPORT_DIR=/path/to/exports npm run test
   *
   * Any archive in the directory should be recognized by some format — the
   * assertions deliberately avoid pinning counts, which would depend on whose
   * export it is.
   */
  const exportDir = process.env.LLM_AGG_TEST_EXPORT_DIR

  it.skipIf(!exportDir)('recognizes every export in LLM_AGG_TEST_EXPORT_DIR', async () => {
    const { readdirSync, statSync } = await import('fs')
    const candidates = readdirSync(exportDir!)
      .map((name) => join(exportDir!, name))
      .filter((p) => statSync(p).isDirectory() || /\.(zip|json|html|csv)$/i.test(p))

    expect(candidates.length, `No export files found in ${exportDir}`).toBeGreaterThan(0)

    for (const candidate of candidates) {
      const entry = await readArchiveEntry(candidate, READER_OPTIONS)
      expect(entry, `Nothing recognized inside ${candidate}`).not.toBeNull()

      const format = detectArchiveFormat(entry!.text)
      expect(format, `No format matched ${entry!.entryPath}`).not.toBeNull()

      const conversations = format!.parse(entry!.text)
      expect(conversations.length, `${format!.id} parsed 0 conversations`).toBeGreaterThan(0)
      // Every conversation must carry at least one message, or pairing yields nothing.
      expect(conversations.every((c) => c.messages.length > 0)).toBe(true)
    }
  })
})
