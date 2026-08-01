/**
 * INV-DATA / archive health: the scan aggregator reports parse failures and
 * duplicate ids instead of silently overwriting, and builds a deterministic
 * id→path index.
 */
import { describe, it, expect } from 'vitest'
import { aggregateScan, type ScannedFile } from '../../electron/services/persistence/qaIndex'
import type { QAPairData } from '../../electron/services/qaPairService'

function pair(id: string, filepath: string): QAPairData {
  return {
    id,
    filepath,
    title: 't',
    source: 'manual',
    url: '',
    tags: [],
    timestamp: '',
    version: 0,
    threadPairs: [],
    question: 'q',
    answer: 'a',
  }
}

describe('aggregateScan', () => {
  it('indexes distinct pairs by id', () => {
    const files: ScannedFile[] = [
      { path: '/a/1.md', pair: pair('id1', '/a/1.md') },
      { path: '/a/2.md', pair: pair('id2', '/a/2.md') },
    ]
    const scan = aggregateScan(files)
    expect(Object.keys(scan.pairs).sort()).toEqual(['id1', 'id2'])
    expect(scan.index.get('id1')).toBe('/a/1.md')
    expect(scan.duplicates).toEqual([])
    expect(scan.skipped).toEqual([])
  })

  it('keeps the path-first duplicate and reports the rest (no silent overwrite)', () => {
    const files: ScannedFile[] = [
      { path: '/a/zzz.md', pair: pair('dup', '/a/zzz.md') },
      { path: '/a/aaa.md', pair: pair('dup', '/a/aaa.md') },
    ]
    const scan = aggregateScan(files)
    // Deterministic: the lexicographically-first path wins regardless of input order.
    expect(scan.index.get('dup')).toBe('/a/aaa.md')
    expect(scan.pairs['dup'].filepath).toBe('/a/aaa.md')
    expect(scan.duplicates).toEqual([
      { id: 'dup', keptPath: '/a/aaa.md', duplicatePath: '/a/zzz.md' },
    ])
  })

  it('records files that failed to parse as skipped', () => {
    const files: ScannedFile[] = [
      { path: '/a/ok.md', pair: pair('ok', '/a/ok.md') },
      { path: '/a/broken.md', pair: null },
    ]
    const scan = aggregateScan(files)
    expect(Object.keys(scan.pairs)).toEqual(['ok'])
    expect(scan.skipped).toEqual([{ path: '/a/broken.md', reason: 'parse-failed' }])
  })
})
