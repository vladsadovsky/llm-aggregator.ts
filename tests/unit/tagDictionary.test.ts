/**
 * Unit tests for tagDictionaryService (Phase 0).
 *
 * Uses a real temp directory to avoid mocking the file system.
 * The Electron `app` module is not available in Vitest — we mock settingsService
 * so that getDataDirectory() returns our temp dir.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── Mock dependencies before importing the service ──────────────────────────

let tempDir = ''

vi.mock('../../electron/services/settingsService', () => ({
  getDataDirectory: () => tempDir,
}))

vi.mock('../../electron/services/qaPairService', () => ({
  listAllPairs: vi.fn(() => ({})),
}))

vi.mock('../../electron/services/logger', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}))

// Import after mocks are set up
import {
  loadDictionary,
  saveDictionary,
  addTag,
  removeTag,
  renameTag,
  addAlias,
  removeAlias,
  resolveTag,
  isKnownTag,
  listTags,
  syncFromArchive,
  invalidateCache,
} from '../../electron/services/tagDictionaryService'
import { listAllPairs } from '../../electron/services/qaPairService'

// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'tag-test-'))
  invalidateCache()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  invalidateCache()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('loadDictionary', () => {
  it('returns empty dictionary when file does not exist', () => {
    const dict = loadDictionary()
    expect(dict.version).toBe(1)
    expect(dict.tags).toEqual({})
  })

  it('loads existing dictionary from disk', () => {
    const initial = { version: 1, tags: { typescript: { created: '2026-01-01T00:00:00Z', aliases: ['ts'] } } }
    saveDictionary(initial)
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags['typescript']).toBeDefined()
    expect(dict.tags['typescript'].aliases).toEqual(['ts'])
  })

  it('returns empty dictionary on corrupted file', () => {
    const { writeFileSync } = require('fs')
    writeFileSync(join(tempDir, 'tag-dictionary.json'), 'not json')
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags).toEqual({})
  })
})

describe('addTag', () => {
  it('adds a new canonical tag', () => {
    addTag('typescript')
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags['typescript']).toBeDefined()
  })

  it('normalizes tag to lowercase', () => {
    addTag('TypeScript')
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags['typescript']).toBeDefined()
    expect(dict.tags['TypeScript']).toBeUndefined()
  })

  it('adds aliases with the tag', () => {
    addTag('typescript', ['ts', 'TS'])
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags['typescript'].aliases).toContain('ts')
  })

  it('is idempotent — does not duplicate existing tag', () => {
    addTag('typescript')
    addTag('typescript')
    invalidateCache()
    const dict = loadDictionary()
    expect(Object.keys(dict.tags)).toHaveLength(1)
  })

  it('ignores empty string', () => {
    addTag('')
    invalidateCache()
    expect(loadDictionary().tags).toEqual({})
  })
})

describe('removeTag', () => {
  it('removes an existing tag', () => {
    addTag('typescript')
    removeTag('typescript')
    invalidateCache()
    expect(loadDictionary().tags['typescript']).toBeUndefined()
  })

  it('is a no-op for unknown tags', () => {
    removeTag('nonexistent') // should not throw
    expect(loadDictionary().tags).toEqual({})
  })
})

describe('renameTag', () => {
  it('renames a tag and adds old name as alias', () => {
    addTag('js')
    renameTag('js', 'javascript')
    invalidateCache()
    const dict = loadDictionary()
    expect(dict.tags['javascript']).toBeDefined()
    expect(dict.tags['javascript'].aliases).toContain('js')
    expect(dict.tags['js']).toBeUndefined()
  })

  it('no-op when old name does not exist', () => {
    renameTag('nonexistent', 'javascript') // should not throw
    expect(loadDictionary().tags['javascript']).toBeUndefined()
  })

  it('no-op when old and new names are identical', () => {
    addTag('typescript')
    renameTag('typescript', 'typescript')
    invalidateCache()
    expect(loadDictionary().tags['typescript']).toBeDefined()
  })
})

describe('addAlias / removeAlias', () => {
  it('adds an alias to an existing tag', () => {
    addTag('typescript')
    addAlias('typescript', 'ts')
    invalidateCache()
    expect(loadDictionary().tags['typescript'].aliases).toContain('ts')
  })

  it('does not duplicate aliases', () => {
    addTag('typescript')
    addAlias('typescript', 'ts')
    addAlias('typescript', 'ts')
    invalidateCache()
    const aliases = loadDictionary().tags['typescript'].aliases
    expect(aliases.filter((a) => a === 'ts')).toHaveLength(1)
  })

  it('removes an alias', () => {
    addTag('typescript', ['ts'])
    removeAlias('typescript', 'ts')
    invalidateCache()
    expect(loadDictionary().tags['typescript'].aliases).not.toContain('ts')
  })
})

describe('resolveTag', () => {
  beforeEach(() => {
    addTag('typescript', ['ts', 'TS'])
    addTag('react')
  })

  it('returns canonical for exact match', () => {
    expect(resolveTag('typescript')).toBe('typescript')
  })

  it('returns canonical for alias', () => {
    expect(resolveTag('ts')).toBe('typescript')
  })

  it('returns canonical — alias lookup is case-insensitive', () => {
    expect(resolveTag('TS')).toBe('typescript')
  })

  it('returns null for unknown input', () => {
    expect(resolveTag('vue')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveTag('')).toBeNull()
  })
})

describe('isKnownTag', () => {
  it('returns true for known tag', () => {
    addTag('typescript')
    expect(isKnownTag('typescript')).toBe(true)
  })

  it('returns true for known alias', () => {
    addTag('typescript', ['ts'])
    expect(isKnownTag('ts')).toBe(true)
  })

  it('returns false for unknown tag', () => {
    expect(isKnownTag('vue')).toBe(false)
  })
})

describe('listTags', () => {
  it('returns tags sorted alphabetically', () => {
    addTag('react')
    addTag('typescript')
    addTag('css')
    invalidateCache()
    expect(listTags()).toEqual(['css', 'react', 'typescript'])
  })

  it('returns empty array when dictionary is empty', () => {
    expect(listTags()).toEqual([])
  })
})

describe('syncFromArchive', () => {
  it('adds tags from QA pairs not yet in dictionary', () => {
    vi.mocked(listAllPairs).mockReturnValueOnce({
      'qa-1': { tags: ['typescript', 'react'] } as any,
      'qa-2': { tags: ['css'] } as any,
    })
    const result = syncFromArchive()
    expect(result.added).toContain('typescript')
    expect(result.added).toContain('react')
    expect(result.added).toContain('css')
    invalidateCache()
    expect(listTags()).toEqual(['css', 'react', 'typescript'])
  })

  it('does not re-add tags already in dictionary', () => {
    addTag('typescript')
    vi.mocked(listAllPairs).mockReturnValueOnce({
      'qa-1': { tags: ['typescript', 'react'] } as any,
    })
    const result = syncFromArchive()
    expect(result.added).not.toContain('typescript')
    expect(result.added).toContain('react')
  })

  it('returns empty added list when archive is empty', () => {
    vi.mocked(listAllPairs).mockReturnValueOnce({})
    const result = syncFromArchive()
    expect(result.added).toEqual([])
  })

  it('skips empty tags', () => {
    vi.mocked(listAllPairs).mockReturnValueOnce({
      'qa-1': { tags: ['', '  ', 'typescript'] } as any,
    })
    const result = syncFromArchive()
    expect(result.added).toEqual(['typescript'])
  })
})
