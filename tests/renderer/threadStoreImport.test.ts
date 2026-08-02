import { describe, expect, it, vi } from 'vitest'
import { useThreadStore } from '../../src/stores/threadStore'
import type { ThreadMap } from '../../src/types/Thread'

describe('thread import persistence', () => {
  it('creates a populated thread with one durable save and reloads the same membership', async () => {
    let persisted: ThreadMap = {}
    const save = vi.fn(async (threads: ThreadMap) => {
      persisted = structuredClone(threads)
    })
    window.api.threadsSave = save
    window.api.threadsLoad = vi.fn(async () => structuredClone(persisted))

    const store = useThreadStore()
    const tid = await store.createThreadWithItems('Roundtrip', ['qa-1', 'qa-2'], {
      tags: ['claude', 'migration'],
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(persisted[tid]).toMatchObject({
      name: 'Roundtrip',
      items: ['qa-1', 'qa-2'],
      tags: ['claude', 'migration'],
    })

    store.threads = {}
    await store.loadThreads()
    expect(store.threads[tid]?.items).toEqual(['qa-1', 'qa-2'])
    expect(store.threads[tid]?.tags).toEqual(['claude', 'migration'])
  })
})

describe('redundant-thread repair projection', () => {
  it('updates renderer state only after main returns a durable repaired map', async () => {
    const store = useThreadStore()
    store.threads = {
      t1: { name: 'Same', items: ['qa-1'] },
      t2: { name: 'Same', items: ['qa-1'] },
    }
    store.selectedThreadId = 't2'
    window.api.threadsRepairRedundant = vi.fn(async () => ({
      threads: { t1: { name: 'Same', items: ['qa-1'] } },
      mergedGroups: 1,
      removedThreadIds: ['t2'],
    }))

    await store.repairRedundantThreads([{
      itemIds: ['qa-1'], threadIds: ['t1', 't2'], survivorId: 't1', redundantIds: ['t2'],
      importSourceIds: [], metadataDiffers: false,
    }])
    expect(Object.keys(store.threads)).toEqual(['t1'])
    expect(store.selectedThreadId).toBe('t1')
  })

  it('keeps renderer state unchanged when main rejects the repair', async () => {
    const store = useThreadStore()
    store.threads = {
      t1: { name: 'Same', items: ['qa-1'] },
      t2: { name: 'Same', items: ['qa-1'] },
    }
    window.api.threadsRepairRedundant = vi.fn(async () => { throw new Error('disk full') })

    await expect(store.repairRedundantThreads([{
      itemIds: ['qa-1'], threadIds: ['t1', 't2'], survivorId: 't1', redundantIds: ['t2'],
      importSourceIds: [], metadataDiffers: false,
    }])).rejects.toThrow('disk full')
    expect(Object.keys(store.threads)).toEqual(['t1', 't2'])
  })
})
