import { describe, expect, it, vi } from 'vitest'
import type { ThreadMap } from '../../src/types/Thread'
import type { QAPairData } from '../../electron/services/qaPairService'
import type { ArchiveScan } from '../../electron/services/persistence/qaIndex'
import {
  deleteThreadsWithContents,
  decideThreadDeletionRecovery,
  previewThreadDeletion,
  type DeleteManifest,
  type ThreadDeletionDeps,
} from '../../electron/services/threadDeletionService'

function pair(id: string): QAPairData {
  return {
    id, filepath: `C:\\archive\\${id}.md`, title: id, source: 'test', url: '', tags: [],
    timestamp: '', version: 0, threadPairs: [], question: '', answer: '',
  }
}

function harness(initial: ThreadMap, pairIds: string[]) {
  let threads = structuredClone(initial)
  const events: string[] = []
  const finish = vi.fn(() => { events.push('finish') })
  const rollback = vi.fn(() => { events.push('rollback') })
  const deps: ThreadDeletionDeps = {
    load: () => structuredClone(threads),
    save: vi.fn((next) => { events.push('save'); threads = structuredClone(next) }),
    scan: () => {
      const pairs = Object.fromEntries(pairIds.map((id) => [id, pair(id)]))
      return { pairs, index: new Map(), duplicates: [], skipped: [] } satisfies ArchiveScan
    },
    stage: vi.fn((pairs) => {
      events.push(`stage:${pairs.map((item) => item.id).join(',')}`)
      return { id: 'op1', finish, rollback }
    }),
  }
  return { deps, events, finish, rollback, threads: () => threads }
}

describe('threadDeletionService', () => {
  it('stages only unshared QAs, saves once, then finalizes', () => {
    const h = harness({
      selected: { name: 'Selected', items: ['private', 'shared'] },
      survivor: { name: 'Survivor', items: ['shared'] },
    }, ['private', 'shared'])
    const preview = previewThreadDeletion(['selected'], h.deps)
    expect(preview.qaIdsToDelete).toEqual(['private'])
    expect(preview.sharedQaIds).toEqual(['shared'])

    const result = deleteThreadsWithContents(['selected'], preview.token, h.deps)
    expect(h.events).toEqual(['stage:private', 'save', 'finish'])
    expect(result.cleanupPending).toBe(false)
    expect(h.threads()).toEqual({ survivor: { name: 'Survivor', items: ['shared'] } })
  })

  it('rejects a stale confirmation before staging files', () => {
    const h = harness({ selected: { name: 'Selected', items: ['qa1'] } }, ['qa1'])
    const preview = previewThreadDeletion(['selected'], h.deps)
    h.deps.load = () => ({ selected: { name: 'Changed', items: ['qa1'] } })
    expect(() => deleteThreadsWithContents(['selected'], preview.token, h.deps)).toThrow(/changed after confirmation/i)
    expect(h.deps.stage).not.toHaveBeenCalled()
  })

  it('invalidates the confirmation when candidate QA content changes', () => {
    const h = harness({ selected: { name: 'Selected', items: ['qa1'] } }, ['qa1'])
    const preview = previewThreadDeletion(['selected'], h.deps)
    h.deps.scan = () => {
      const changed = pair('qa1')
      changed.answer = 'edited outside the app'
      return { pairs: { qa1: changed }, index: new Map(), duplicates: [], skipped: [] }
    }
    expect(() => deleteThreadsWithContents(['selected'], preview.token, h.deps)).toThrow(/changed after confirmation/i)
    expect(h.deps.stage).not.toHaveBeenCalled()
  })

  it('rolls staged files back when the thread-map save fails', () => {
    const h = harness({ selected: { name: 'Selected', items: ['qa1'] } }, ['qa1'])
    const preview = previewThreadDeletion(['selected'], h.deps)
    h.deps.save = vi.fn(() => { h.events.push('save'); throw new Error('disk full') })
    expect(() => deleteThreadsWithContents(['selected'], preview.token, h.deps)).toThrow('disk full')
    expect(h.events).toEqual(['stage:qa1', 'save', 'rollback'])
    expect(h.finish).not.toHaveBeenCalled()
  })

  it('reports post-commit cleanup failure without rolling the durable delete back', () => {
    const h = harness({ selected: { name: 'Selected', items: ['qa1'] } }, ['qa1'])
    h.deps.stage = () => ({ id: 'op1', rollback: h.rollback, finish: () => { throw new Error('locked') } })
    const preview = previewThreadDeletion(['selected'], h.deps)
    const result = deleteThreadsWithContents(['selected'], preview.token, h.deps)
    expect(result.cleanupPending).toBe(true)
    expect(h.rollback).not.toHaveBeenCalled()
    expect(h.threads()).toEqual({})
  })

  it('blocks complete redundant groups and duplicate QA ids before staging', () => {
    const redundant = harness({
      a: { name: 'A', items: ['qa1'] }, b: { name: 'B', items: ['qa1'] },
    }, ['qa1'])
    expect(() => previewThreadDeletion(['a', 'b'], redundant.deps)).toThrow(/Find Redundant Threads/i)

    const duplicate = harness({ a: { name: 'A', items: ['qa1'] } }, ['qa1'])
    duplicate.deps.scan = () => ({
      pairs: { qa1: pair('qa1') }, index: new Map(),
      duplicates: [{ id: 'qa1', keptPath: 'one.md', duplicatePath: 'two.md' }], skipped: [],
    })
    expect(() => previewThreadDeletion(['a'], duplicate.deps)).toThrow(/duplicate archive files/i)
  })

  it('chooses fail-closed recovery actions for every journal state', () => {
    const before = { selected: { name: 'Selected', items: ['qa1'] } }
    const after = {}
    const base: DeleteManifest = {
      version: 1, state: 'prepared', before, after, files: [{ id: 'qa1', name: 'qa1.md' }],
    }
    expect(decideThreadDeletionRecovery(before, base)).toBe('rollback')
    expect(decideThreadDeletionRecovery(after, base)).toBe('finalize')
    expect(decideThreadDeletionRecovery({ other: { name: 'Other', items: [] } }, base)).toBe('blocked')

    const committed = { ...base, state: 'committed' as const }
    expect(decideThreadDeletionRecovery({ other: { name: 'Other', items: [] } }, committed)).toBe('finalize')
    expect(decideThreadDeletionRecovery({ other: { name: 'Other', items: ['qa1'] } }, committed)).toBe('blocked')
  })
})
