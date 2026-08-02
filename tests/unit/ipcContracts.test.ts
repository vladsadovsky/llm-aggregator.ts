/**
 * INV-IPC / INV-PATH / INV-OBS: canonical argument schemas reject malformed,
 * traversal-shaped, oversized, and unexpected-field payloads before any service
 * runs; the coded error wire never leaks a stack.
 */
import { describe, it, expect } from 'vitest'
import { CH, ALL_CHANNELS } from '../../shared/contracts/channels'
import { channelArgs } from '../../shared/contracts'
import {
  IPC_ERROR_CODES,
  encodeIpcErrorMessage,
  extractWireError,
  ipcError,
} from '../../shared/contracts/errorWire'

const parse = (ch: string, args: unknown[]) =>
  (channelArgs as Record<string, { safeParse: (a: unknown) => { success: boolean } }>)[ch].safeParse(args)

describe('channel/schema parity', () => {
  it('every channel has exactly one argument schema and vice versa', () => {
    const schemaKeys = Object.keys(channelArgs).sort()
    const channelKeys = [...ALL_CHANNELS].sort()
    expect(schemaKeys).toEqual(channelKeys)
  })
})

describe('no-argument channels', () => {
  const noArg = [CH.settingsLoad, CH.qaListAll, CH.tagsSync, CH.archiveReset, CH.secretsLoad]
  it.each(noArg)('%s accepts [] and rejects extra args', (ch) => {
    expect(parse(ch, []).success).toBe(true)
    expect(parse(ch, ['unexpected']).success).toBe(false)
  })
})

describe('id-addressed channels', () => {
  const idChannels = [CH.qaGet, CH.qaDelete, CH.exportQa, CH.aiGenerateEmbedding]
  it.each(idChannels)('%s accepts a real id', (ch) => {
    expect(parse(ch, ['20260204_2135']).success).toBe(true)
  })
  it.each(idChannels)('%s rejects traversal / separators / empty / oversized', (ch) => {
    expect(parse(ch, ['../secret']).success).toBe(false)
    expect(parse(ch, ['a/b']).success).toBe(false)
    expect(parse(ch, ['a\\b']).success).toBe(false)
    expect(parse(ch, ['..']).success).toBe(false)
    expect(parse(ch, ['']).success).toBe(false)
    expect(parse(ch, ['x'.repeat(300)]).success).toBe(false)
    expect(parse(ch, [42]).success).toBe(false)
  })
  it('accepts a UUID preview-style id (hyphens allowed)', () => {
    expect(parse(CH.qaGet, ['550e8400-e29b-41d4-a716-446655440000']).success).toBe(true)
  })
})

describe('settings:save', () => {
  const valid = {
    dataDirectory: 'C:/data',
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
    lensEnabled: false,
    tagEnforcement: 'warn',
    tagSoftLimit: 5,
    tagHardLimit: 10,
    allowDevEnvSecrets: false,
  }
  it('accepts a complete settings object', () => {
    expect(parse(CH.settingsSave, [valid]).success).toBe(true)
  })
  it('rejects an unexpected field (strict)', () => {
    expect(parse(CH.settingsSave, [{ ...valid, evil: 1 }]).success).toBe(false)
  })
  it('rejects a NaN / non-finite limit', () => {
    expect(parse(CH.settingsSave, [{ ...valid, tagSoftLimit: NaN }]).success).toBe(false)
    expect(parse(CH.settingsSave, [{ ...valid, tagHardLimit: Infinity }]).success).toBe(false)
  })
  it('rejects a wrong enum discriminant', () => {
    expect(parse(CH.settingsSave, [{ ...valid, tagEnforcement: 'nuke' }]).success).toBe(false)
  })
})

describe('secrets:save', () => {
  it('accepts a partial update', () => {
    expect(parse(CH.secretsSave, [{ openaiApiKey: 'sk-test' }]).success).toBe(true)
    expect(parse(CH.secretsSave, [{}]).success).toBe(true)
  })
  it('rejects unknown secret ids and oversized values', () => {
    expect(parse(CH.secretsSave, [{ rogueKey: 'x' }]).success).toBe(false)
    expect(parse(CH.secretsSave, [{ openaiApiKey: 'x'.repeat(2000) }]).success).toBe(false)
  })
})

describe('qa:update', () => {
  it('accepts a partial update and rejects unknown fields / bad enums', () => {
    expect(parse(CH.qaUpdate, ['20260204_2135', { title: 'Hi' }]).success).toBe(true)
    expect(parse(CH.qaUpdate, ['20260204_2135', { rogue: 1 }]).success).toBe(false)
    expect(parse(CH.qaUpdate, ['20260204_2135', { aiStatus: 'wat' }]).success).toBe(false)
  })
})

describe('search:semantic', () => {
  it('accepts a bounded query + topK, rejects NaN / infinity / out of range', () => {
    expect(parse(CH.searchSemantic, ['hi', 5]).success).toBe(true)
    expect(parse(CH.searchSemantic, ['hi', NaN]).success).toBe(false)
    expect(parse(CH.searchSemantic, ['hi', Infinity]).success).toBe(false)
    expect(parse(CH.searchSemantic, ['hi', 0]).success).toBe(false)
    expect(parse(CH.searchSemantic, ['hi', 2.5]).success).toBe(false)
  })
})

describe('duplicates:delete', () => {
  it('accepts an explicit survivor mapping and rejects traversal-shaped members', () => {
    const valid = [{ key: 'fingerprint', matchKind: 'content', keepId: '20260204_2135', removeIds: ['20260205_1845'] }]
    expect(parse(CH.duplicatesDelete, [valid]).success).toBe(true)
    expect(parse(CH.duplicatesDelete, [[{ ...valid[0], removeIds: ['../evil'] }]]).success).toBe(false)
    expect(parse(CH.duplicatesDelete, ['not-an-array']).success).toBe(false)
  })
})

describe('import:archiveCommit', () => {
  it('accepts a valid selection and rejects unknown fields', () => {
    expect(
      parse(CH.importArchiveCommit, ['prev-1', { threadSourceIds: ['a'], skipDuplicates: true }])
        .success,
    ).toBe(true)
    expect(
      parse(CH.importArchiveCommit, [
        'prev-1',
        { threadSourceIds: ['a'], skipDuplicates: true, includeDateInThreadNames: true },
      ]).success,
    ).toBe(true)
    expect(
      parse(CH.importArchiveCommit, [
        'prev-1',
        { threadSourceIds: ['a'], skipDuplicates: true, includeDateInThreadNames: false },
      ]).success,
    ).toBe(true)
    expect(
      parse(CH.importArchiveCommit, [
        'prev-1',
        { threadSourceIds: ['a'], skipDuplicates: true, includeDateInThreadNames: 'yes' },
      ]).success,
    ).toBe(false)
    expect(
      parse(CH.importArchiveCommit, ['prev-1', { threadSourceIds: ['a'], skipDuplicates: true, evil: 1 }])
        .success,
    ).toBe(false)
  })
})

describe('threads:save', () => {
  it('accepts a thread map and rejects an entry with unexpected fields', () => {
    expect(parse(CH.threadsSave, [{ t1: { name: 'X', items: ['20260204_2135'] } }]).success).toBe(true)
    expect(
      parse(CH.threadsSave, [
        {
          t1: {
            name: 'Imported',
            items: ['20260204_2135'],
            importSourceId: 'claude-account-export:conversation-1',
          },
        },
      ]).success,
    ).toBe(true)
    expect(parse(CH.threadsSave, [{ t1: { name: 'X', items: [], rogue: 1 } }]).success).toBe(false)
  })
})

describe('threads:repairRedundant', () => {
  it('accepts a reviewed group and rejects empty/traversal-shaped ids', () => {
    expect(parse(CH.threadsRepairRedundant, [[{
      itemIds: ['20260204_2135'], survivorId: 'thread_1', redundantIds: ['thread_2'],
    }]]).success).toBe(true)
    expect(parse(CH.threadsRepairRedundant, [[{
      itemIds: ['20260204_2135'], survivorId: 'thread_1', redundantIds: [],
    }]]).success).toBe(false)
    expect(parse(CH.threadsRepairRedundant, [[{
      itemIds: ['20260204_2135'], survivorId: '../evil', redundantIds: ['thread_2'],
    }]]).success).toBe(false)
  })
})

describe('thread deletion', () => {
  it('validates non-empty thread ids and a full preview token', () => {
    expect(parse(CH.threadsDeletePreview, [['thread_1', 'thread_2']]).success).toBe(true)
    expect(parse(CH.threadsDeletePreview, [[]]).success).toBe(false)
    expect(parse(CH.threadsDeletePreview, [['../escape']]).success).toBe(false)
    expect(parse(CH.threadsDeleteApply, [['thread_1'], 'a'.repeat(64)]).success).toBe(true)
    expect(parse(CH.threadsDeleteApply, [['thread_1'], 'short']).success).toBe(false)
  })
})

describe('openExternal', () => {
  it('accepts a bounded url and rejects an oversized one', () => {
    expect(parse(CH.openExternal, ['https://example.com']).success).toBe(true)
    expect(parse(CH.openExternal, ['https://x/' + 'a'.repeat(3000)]).success).toBe(false)
  })
})

describe('coded error wire', () => {
  it('round-trips code + message', () => {
    const wire = encodeIpcErrorMessage('invalid-payload', 'bad thing')
    expect(extractWireError(wire)).toEqual({ code: 'invalid-payload', message: 'bad thing' })
  })
  it('extracts from an Electron-wrapped rejection message', () => {
    const wire = encodeIpcErrorMessage('not-found', 'gone')
    const wrapped = `Error invoking remote method 'qa:get': Error: ${wire}`
    expect(extractWireError(wrapped)).toEqual({ code: 'not-found', message: 'gone' })
  })
  it('stops the message at a newline so a trailing stack cannot leak', () => {
    const raw = `IPCERR:internal:safe message\n    at Foo (C:/secret/path.ts:1:1)`
    expect(extractWireError(raw)).toEqual({ code: 'internal', message: 'safe message' })
  })
  it('returns null for non-coded and unknown-code messages', () => {
    expect(extractWireError('plain error')).toBeNull()
    expect(extractWireError('IPCERR:made-up:x')).toBeNull()
  })
  it('every code is a known, stable string', () => {
    for (const code of IPC_ERROR_CODES) {
      const e = ipcError(code, 'm')
      expect(e.code).toBe(code)
    }
  })
})
