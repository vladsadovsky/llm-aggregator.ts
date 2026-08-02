import { describe, expect, it, vi } from 'vitest'
import { repairRedundantThreadGroups } from '../../electron/services/redundantThreadRepairService'
import { findRedundantThreadGroups } from '../../shared/threads/redundantThreadGroups'
import type { ThreadMap } from '../../src/types/Thread'

function fixture(): ThreadMap {
  return {
    thread_1: {
      name: 'Imported', items: ['qa_1'], tags: ['a'],
      createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z',
      importSourceId: 'claude:conversation',
    },
    thread_2: {
      name: 'Imported', items: ['qa_1'], tags: ['b'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z',
    },
    unrelated: { name: 'Keep me', items: ['qa_2'] },
  }
}

describe('repairRedundantThreadGroups', () => {
  it('merges metadata and removes wrappers in one save without touching the input snapshot', () => {
    const original = fixture()
    const [group] = findRedundantThreadGroups(original)
    const save = vi.fn()
    const result = repairRedundantThreadGroups([group], { load: () => original, save })

    expect(save).toHaveBeenCalledTimes(1)
    expect(result.removedThreadIds).toEqual(['thread_2'])
    expect(result.threads.thread_2).toBeUndefined()
    expect(result.threads.thread_1).toMatchObject({
      items: ['qa_1'], tags: ['a', 'b'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z',
      importSourceId: 'claude:conversation',
    })
    expect(original.thread_2).toBeDefined()
  })

  it('does not expose staged mutations when the atomic save fails', () => {
    const original = fixture()
    const [group] = findRedundantThreadGroups(original)
    expect(() => repairRedundantThreadGroups([group], {
      load: () => original,
      save: () => { throw new Error('disk full') },
    })).toThrow('disk full')
    expect(Object.keys(original)).toEqual(['thread_1', 'thread_2', 'unrelated'])
  })

  it('rejects a stale scan before saving', () => {
    const original = fixture()
    const [group] = findRedundantThreadGroups(original)
    original.thread_2.items = ['qa_changed']
    const save = vi.fn()
    expect(() => repairRedundantThreadGroups([group], { load: () => original, save })).toThrow(/changed/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('blocks distinct import identities rather than deleting provenance', () => {
    const original = fixture()
    original.thread_2.importSourceId = 'claude:other-conversation'
    const [group] = findRedundantThreadGroups(original)
    const save = vi.fn()
    expect(() => repairRedundantThreadGroups([group], { load: () => original, save })).toThrow(/manual review/i)
    expect(save).not.toHaveBeenCalled()
  })

  it('persists Merge All as one all-or-nothing map write', () => {
    const original = fixture()
    original.thread_3 = { name: 'Other', items: ['qa_3'] }
    original.thread_4 = { name: 'Other', items: ['qa_3'] }
    const groups = findRedundantThreadGroups(original)
    const save = vi.fn()
    const result = repairRedundantThreadGroups(groups, { load: () => original, save })
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.mergedGroups).toBe(2)
    expect(Object.keys(result.threads).sort()).toEqual(['thread_1', 'thread_3', 'unrelated'])
  })
})
