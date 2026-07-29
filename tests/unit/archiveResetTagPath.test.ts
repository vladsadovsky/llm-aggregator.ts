/**
 * D7.5 — archive reset must locate tag-dictionary.json where tagDictionaryService
 * actually writes it (under raw getDataDirectory()), not under getDataDir().
 * They diverge when the user selects the `archive` folder itself as the data
 * directory, and reset then reported `tags: 0` and mis-reported what it removed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let root = ''
let selectedDataDir = '' // what the user picked: <root>/archive

vi.mock('../../electron/services/settingsService', () => ({
  getDataDirectory: () => selectedDataDir,
}))
vi.mock('electron', () => ({ app: { getPath: () => join(root, 'userData') } }))
vi.mock('../../electron/services/threadService', () => ({ saveThreads: vi.fn() }))
vi.mock('../../electron/services/logger', () => ({ debugLog: vi.fn(), debugError: vi.fn() }))

import { previewArchiveReset, resetArchive } from '../../electron/services/archiveResetService'
import { getDictionaryPath } from '../../electron/services/tagDictionaryService'

describe('archive reset tag-dictionary path (archive folder selected)', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reset-'))
    // getDataDirectory() = <root>/archive (basename "archive"), so getDataDir()
    // resolves to the parent <root> — the exact split that caused the bug.
    selectedDataDir = join(root, 'archive')
    mkdirSync(selectedDataDir, { recursive: true })
    writeFileSync(
      getDictionaryPath(),
      JSON.stringify({ version: 1, tags: { alpha: {}, beta: {} } }),
      'utf-8',
    )
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves the dictionary under getDataDirectory(), not getDataDir()', () => {
    expect(getDictionaryPath()).toBe(join(selectedDataDir, 'tag-dictionary.json'))
  })

  it('counts the dictionary tags in the preview (was 0 before the fix)', () => {
    expect(previewArchiveReset().tags).toBe(2)
  })

  it('removes the dictionary and reports the right count on reset', () => {
    expect(existsSync(getDictionaryPath())).toBe(true)
    const result = resetArchive()
    expect(result.tagsRemoved).toBe(2)
    expect(existsSync(getDictionaryPath())).toBe(false) // no longer at the live path
  })
})
