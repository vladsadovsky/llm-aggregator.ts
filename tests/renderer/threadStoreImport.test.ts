import { describe, expect, it, vi } from 'vitest'
import { useThreadStore } from '../../src/stores/threadStore'
import { useQAStore } from '../../src/stores/qaStore'
import type { ThreadMap } from '../../src/types/Thread'
import type { QAPairData } from '../../src/types/QAPair'

function qa(id: string): QAPairData {
  return {
    id, filepath: `${id}.md`, title: id, source: 'test', url: '', tags: [], timestamp: '',
    version: 0, threadPairs: [], question: '', answer: '',
  }
}

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

  it('does not publish a new thread when its durable save fails', async () => {
    const store = useThreadStore()
    window.api.threadsSave = vi.fn(async () => { throw new Error('disk full') })

    await expect(store.createThread('Not persisted')).rejects.toThrow('disk full')
    expect(store.threads).toEqual({})
  })
})

describe('ordinary thread mutation persistence', () => {
  it('keeps the rendered map unchanged when an edit cannot be saved', async () => {
    const store = useThreadStore()
    store.threads = { t1: { name: 'Original', items: ['qa-1'] } }
    window.api.threadsSave = vi.fn(async () => { throw new Error('disk full') })

    await expect(store.renameThread('t1', 'Unsaved')).rejects.toThrow('disk full')
    expect(store.threads.t1).toEqual({ name: 'Original', items: ['qa-1'] })
  })

  it('does not remove a source membership when the destination is missing', async () => {
    const store = useThreadStore()
    store.threads = { source: { name: 'Source', items: ['qa-1'] } }
    window.api.threadsSave = vi.fn()

    await expect(store.moveToThread('source', 'missing', 'qa-1')).rejects.toThrow('destination thread')
    expect(store.threads.source.items).toEqual(['qa-1'])
    expect(window.api.threadsSave).not.toHaveBeenCalled()
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

describe('thread deletion projection', () => {
  it('projects the committed thread map and removes only main-approved QA ids', async () => {
    const threadStore = useThreadStore()
    const qaStore = useQAStore()
    threadStore.threads = {
      selected: { name: 'Selected', items: ['private', 'shared'] },
      survivor: { name: 'Survivor', items: ['shared'] },
    }
    threadStore.selectedThreadId = 'selected'
    qaStore.pairs = { private: qa('private'), shared: qa('shared') }
    qaStore.selectedPairId = 'private'
    window.api.threadsDeleteApply = vi.fn(async () => ({
      token: 'a'.repeat(64), threadIds: ['selected'], qaIdsToDelete: ['private'],
      sharedQaIds: ['shared'], sharedThreadIds: ['survivor'],
      threads: { survivor: { name: 'Survivor', items: ['shared'] } }, cleanupPending: false,
    }))

    await threadStore.deleteThreadsWithContents(['selected'], 'a'.repeat(64))
    expect(threadStore.threads).toEqual({ survivor: { name: 'Survivor', items: ['shared'] } })
    expect(threadStore.selectedThreadId).toBeNull()
    expect(Object.keys(qaStore.pairs)).toEqual(['shared'])
    expect(qaStore.selectedPairId).toBeNull()
  })

  it('reloads both stores when the apply response is lost', async () => {
    const threadStore = useThreadStore()
    const qaStore = useQAStore()
    threadStore.threads = { selected: { name: 'Selected', items: ['qa1'] } }
    qaStore.pairs = { qa1: qa('qa1') }
    window.api.threadsDeleteApply = vi.fn(async () => { throw new Error('response lost') })
    window.api.threadsLoad = vi.fn(async () => ({}))
    window.api.qaListAll = vi.fn(async () => ({}))

    await expect(threadStore.deleteThreadsWithContents(['selected'], 'a'.repeat(64))).rejects.toThrow('response lost')
    expect(threadStore.threads).toEqual({})
    expect(qaStore.pairs).toEqual({})
  })
})
