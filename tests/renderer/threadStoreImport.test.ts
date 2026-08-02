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
