/**
 * INV-DATA: the last valid target survives every failure mode. On a fault at
 * open/write/fsync/close/validate/promote the original file is byte-identical and
 * only this operation's temp file is cleaned up; a valid last-known-good can be
 * recovered.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  atomicWriteFileSync,
  atomicWriteJsonSync,
  nodeFileOps,
  AtomicWriteError,
  type FileOps,
} from '../../electron/services/persistence/atomicFile'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomic-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const tempFiles = () => readdirSync(dir).filter((f) => f.includes('.tmp'))

/** Real fs ops in the temp dir, but throw at one named step. */
function failingOps(step: string): FileOps {
  const boom = () => {
    throw Object.assign(new Error(`injected ${step} failure`), { code: 'EIO' })
  }
  return {
    ...nodeFileOps,
    openSync: step === 'open' ? boom : nodeFileOps.openSync,
    writeSync: step === 'write' ? boom : nodeFileOps.writeSync,
    fsyncSync: step === 'fsync' ? boom : nodeFileOps.fsyncSync,
    renameSync: step === 'promote' ? boom : nodeFileOps.renameSync,
  }
}

describe('atomicWriteFileSync — happy path', () => {
  it('writes new content and leaves no temp file', () => {
    const target = join(dir, 'data.json')
    const res = atomicWriteFileSync(target, 'hello')
    expect(readFileSync(target, 'utf-8')).toBe('hello')
    expect(res.bytes).toBe(5)
    expect(tempFiles()).toEqual([])
  })

  it('replaces existing content atomically', () => {
    const target = join(dir, 'data.json')
    writeFileSync(target, 'old')
    atomicWriteFileSync(target, 'new')
    expect(readFileSync(target, 'utf-8')).toBe('new')
    expect(tempFiles()).toEqual([])
  })

  it('keeps a last-known-good sibling when asked', () => {
    const target = join(dir, 'settings.json')
    writeFileSync(target, 'original')
    const res = atomicWriteFileSync(target, 'updated', { keepLastKnownGood: true })
    expect(res.lastKnownGoodPath).toBe(`${target}.bak`)
    expect(readFileSync(`${target}.bak`, 'utf-8')).toBe('original')
    expect(readFileSync(target, 'utf-8')).toBe('updated')
  })
})

describe('atomicWriteFileSync — failure injection', () => {
  const steps = ['open', 'write', 'fsync', 'promote'] as const
  it.each(steps)('leaves the original intact and cleans temp when %s fails', (step) => {
    const target = join(dir, 'data.json')
    writeFileSync(target, 'ORIGINAL')
    expect(() => atomicWriteFileSync(target, 'REPLACEMENT', { fileOps: failingOps(step) })).toThrow(
      AtomicWriteError,
    )
    // Old target is byte-identical.
    expect(readFileSync(target, 'utf-8')).toBe('ORIGINAL')
    // No temp litter left behind.
    expect(tempFiles()).toEqual([])
  })

  it('does not create the target at all when the first write fails on a new file', () => {
    const target = join(dir, 'fresh.json')
    expect(() => atomicWriteFileSync(target, 'x', { fileOps: failingOps('write') })).toThrow()
    expect(existsSync(target)).toBe(false)
    expect(tempFiles()).toEqual([])
  })

  it('reports the failing step', () => {
    const target = join(dir, 'data.json')
    try {
      atomicWriteFileSync(target, 'x', { fileOps: failingOps('promote') })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AtomicWriteError)
      expect((err as AtomicWriteError).step).toBe('promote')
    }
  })
})

describe('atomicWriteJsonSync', () => {
  it('round-trips an object and reloads equal', () => {
    const target = join(dir, 'obj.json')
    const value = { a: 1, b: ['x', 'y'], nested: { ok: true } }
    atomicWriteJsonSync(target, value)
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual(value)
  })

  it('rejects (and preserves original) when a custom validator throws', () => {
    const target = join(dir, 'obj.json')
    writeFileSync(target, '{"keep":true}')
    expect(() =>
      atomicWriteJsonSync(target, { a: 1 }, { validate: () => { throw new Error('nope') } }),
    ).toThrow(AtomicWriteError)
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ keep: true })
    expect(tempFiles()).toEqual([])
  })
})

describe('atomicWriteFileSync — transient Windows promote retry', () => {
  /** Real ops, but renameSync throws `code` on its first `failures` calls, then succeeds. */
  function flakyRename(code: string, failures: number): { ops: FileOps; calls: () => number } {
    let calls = 0
    const ops: FileOps = {
      ...nodeFileOps,
      renameSync: (from, to) => {
        calls += 1
        if (calls <= failures) throw Object.assign(new Error(`transient ${code}`), { code })
        nodeFileOps.renameSync(from, to)
      },
    }
    return { ops, calls: () => calls }
  }

  it('retries a transient EPERM and eventually promotes', () => {
    const target = join(dir, 'data.json')
    writeFileSync(target, 'ORIGINAL')
    const { ops, calls } = flakyRename('EPERM', 3)
    const res = atomicWriteFileSync(target, 'UPDATED', { fileOps: ops })
    expect(readFileSync(target, 'utf-8')).toBe('UPDATED')
    expect(res.bytes).toBe(7)
    expect(calls()).toBe(4) // 3 failures + 1 success
    expect(tempFiles()).toEqual([])
  })

  it('gives up after the bounded retry budget and preserves the original', () => {
    const target = join(dir, 'data.json')
    writeFileSync(target, 'ORIGINAL')
    const { ops, calls } = flakyRename('EBUSY', 999)
    expect(() => atomicWriteFileSync(target, 'UPDATED', { fileOps: ops })).toThrow(AtomicWriteError)
    expect(readFileSync(target, 'utf-8')).toBe('ORIGINAL') // last valid target survives
    expect(calls()).toBe(6) // initial attempt + 5 retries
    expect(tempFiles()).toEqual([])
  })

  it('does not retry a non-transient error (ENOENT fails immediately)', () => {
    const target = join(dir, 'data.json')
    writeFileSync(target, 'ORIGINAL')
    const { ops, calls } = flakyRename('ENOENT', 999)
    expect(() => atomicWriteFileSync(target, 'UPDATED', { fileOps: ops })).toThrow(AtomicWriteError)
    expect(calls()).toBe(1) // no retries for a non-transient code
    expect(readFileSync(target, 'utf-8')).toBe('ORIGINAL')
  })
})
