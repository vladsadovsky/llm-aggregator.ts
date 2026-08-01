/**
 * INV-LOAD: missing initializes defaults; corrupt / unreadable / unsupported
 * block a save until an explicit repair or reload clears the barrier.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadJsonFile,
  raiseBarrier,
  clearBarrier,
  assertWritable,
  barrierStatus,
  UnsupportedVersionError,
  _resetBarriers,
} from '../../electron/services/persistence/loadState'

beforeEach(() => _resetBarriers())

function io(files: Record<string, string | Error>) {
  return {
    existsSync: (p: string) => p in files,
    readFileSync: (p: string) => {
      const v = files[p]
      if (v instanceof Error) throw v
      return v
    },
  }
}

describe('loadJsonFile', () => {
  it('classifies a missing file', () => {
    expect(loadJsonFile('/x', { io: io({}) }).status).toBe('missing')
  })

  it('loads valid JSON', () => {
    const s = loadJsonFile<{ a: number }>('/x', { io: io({ '/x': '{"a":1}' }) })
    expect(s.status).toBe('loaded')
    expect(s.value).toEqual({ a: 1 })
  })

  it('flags malformed JSON as corrupt', () => {
    expect(loadJsonFile('/x', { io: io({ '/x': '{not json' }) }).status).toBe('corrupt')
  })

  it('flags an unreadable file', () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    expect(loadJsonFile('/x', { io: io({ '/x': err }) }).status).toBe('unreadable')
  })

  it('routes a validator throw to corrupt', () => {
    const s = loadJsonFile('/x', {
      io: io({ '/x': '{"a":1}' }),
      validate: () => {
        throw new Error('bad shape')
      },
    })
    expect(s.status).toBe('corrupt')
  })

  it('routes an UnsupportedVersionError to unsupported-version', () => {
    const s = loadJsonFile('/x', {
      io: io({ '/x': '{"schemaVersion":99}' }),
      validate: () => {
        throw new UnsupportedVersionError()
      },
    })
    expect(s.status).toBe('unsupported-version')
  })
})

describe('write barrier', () => {
  it('blocks a save after a failed load and clears on repair', () => {
    raiseBarrier('threads.json', 'corrupt')
    expect(barrierStatus('threads.json')).toBe('corrupt')
    expect(() => assertWritable('threads.json')).toThrow(/repaired|reload/i)
    clearBarrier('threads.json')
    expect(() => assertWritable('threads.json')).not.toThrow()
  })

  it('leaves unrelated keys writable', () => {
    raiseBarrier('threads.json', 'corrupt')
    expect(() => assertWritable('settings.json')).not.toThrow()
  })
})
