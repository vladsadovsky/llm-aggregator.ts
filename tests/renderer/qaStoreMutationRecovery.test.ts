import { describe, expect, it, vi } from 'vitest'
import { useQAStore } from '../../src/stores/qaStore'
import type { QACreateData, QAPairData, QAUpdateData } from '../../src/types/QAPair'

const createData: QACreateData = {
  title: 'Question', source: 'test', url: '', tags: [], question: 'Q', answer: 'A',
}

function pair(id: string, title = 'Question'): QAPairData {
  return {
    id, filepath: `${id}.md`, title, source: 'test', url: '', tags: [], timestamp: '',
    version: 0, threadPairs: [], question: 'Q', answer: 'A',
  }
}

describe('QA mutation recovery', () => {
  it('does not replay a create after an ambiguous IPC failure and reloads durable state', async () => {
    const store = useQAStore()
    const committed = pair('created')
    window.api.qaCreate = vi.fn(async () => { throw new Error('response lost') })
    window.api.qaListAll = vi.fn(async () => ({ created: committed }))

    await expect(store.createPair(createData)).rejects.toThrow('response lost')
    expect(window.api.qaCreate).toHaveBeenCalledTimes(1)
    expect(store.pairs).toEqual({ created: committed })
  })

  it('does not replay an update after an ambiguous IPC failure and reloads durable state', async () => {
    const store = useQAStore()
    store.pairs = { qa1: pair('qa1', 'Before') }
    const update: QAUpdateData = { title: 'After' }
    window.api.qaUpdate = vi.fn(async () => { throw new Error('response lost') })
    window.api.qaListAll = vi.fn(async () => ({ qa1: pair('qa1', 'After') }))

    await expect(store.updatePair('qa1', update)).rejects.toThrow('response lost')
    expect(window.api.qaUpdate).toHaveBeenCalledTimes(1)
    expect(store.pairs.qa1.title).toBe('After')
  })

  it('does not replay a delete after an ambiguous IPC failure and reloads durable state', async () => {
    const store = useQAStore()
    store.pairs = { qa1: pair('qa1') }
    store.selectedPairId = 'qa1'
    window.api.qaDelete = vi.fn(async () => { throw new Error('response lost') })
    window.api.qaListAll = vi.fn(async () => ({}))

    await expect(store.deletePair('qa1')).rejects.toThrow('response lost')
    expect(window.api.qaDelete).toHaveBeenCalledTimes(1)
    expect(store.pairs).toEqual({})
    expect(store.selectedPairId).toBeNull()
  })
})
