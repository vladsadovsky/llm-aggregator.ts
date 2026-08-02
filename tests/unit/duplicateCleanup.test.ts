import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pairs: {} as Record<string, any>,
  threads: {} as Record<string, any>,
  save: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../electron/services/qaPairService', () => ({
  listAllPairs: () => state.pairs,
  deletePair: (id: string) => state.remove(id),
}))

vi.mock('../../electron/services/threadService', () => ({
  loadThreads: () => state.threads,
  saveThreads: (threads: Record<string, any>) => state.save(threads),
}))

import { deleteDuplicates, findDuplicateGroups } from '../../electron/services/duplicateService'

function pair(id: string, answer = 'Same answer') {
  return {
    id, title: id, source: 'test', timestamp: '2026-01-01T00:00:00.000Z',
    question: 'Same question', answer,
  }
}

beforeEach(() => {
  state.pairs = { qa_1: pair('qa_1'), qa_2: pair('qa_2') }
  state.threads = {
    t1: { name: 'One', items: ['qa_2', 'other'] },
    t2: { name: 'Two', items: ['qa_1', 'qa_2'] },
  }
  state.save.mockReset()
  state.remove.mockReset()
})

function requestKeeping(keepId: string) {
  const [group] = findDuplicateGroups().groups
  return [{
    key: group.key,
    matchKind: group.matchKind,
    keepId,
    removeIds: group.members.filter((member) => member.id !== keepId).map((member) => member.id),
  }]
}

describe('deleteDuplicates', () => {
  it('durably remaps every thread to the chosen survivor before deleting files', () => {
    const result = deleteDuplicates(requestKeeping('qa_1'))
    expect(state.threads.t1.items).toEqual(['qa_1', 'other'])
    expect(state.threads.t2.items).toEqual(['qa_1'])
    expect(state.save).toHaveBeenCalledTimes(1)
    expect(state.remove).toHaveBeenCalledWith('qa_2')
    expect(state.save.mock.invocationCallOrder[0]).toBeLessThan(state.remove.mock.invocationCallOrder[0])
    expect(result).toMatchObject({ deleted: ['qa_2'], failed: [], threadsUpdated: 2 })
  })

  it('does not delete any QA file when the thread-map save fails', () => {
    state.save.mockImplementationOnce(() => { throw new Error('disk full') })
    expect(() => deleteDuplicates(requestKeeping('qa_1'))).toThrow('disk full')
    expect(state.remove).not.toHaveBeenCalled()
  })

  it('leaves a failed file deletion retryable with all memberships already safe', () => {
    state.remove.mockImplementationOnce(() => { throw new Error('locked') })
    const result = deleteDuplicates(requestKeeping('qa_1'))
    expect(result.deleted).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(Object.values(state.threads).every((thread: any) => !thread.items.includes('qa_2'))).toBe(true)
  })

  it('rejects a stale reviewed group before saving or deleting', () => {
    const request = requestKeeping('qa_1')
    state.pairs.qa_2.answer = 'Changed after scan'
    expect(() => deleteDuplicates(request)).toThrow(/changed after the scan/i)
    expect(state.save).not.toHaveBeenCalled()
    expect(state.remove).not.toHaveBeenCalled()
  })

  it('rejects overlapping requests that could otherwise delete both copies', () => {
    const [first] = requestKeeping('qa_1')
    const inverse = { ...first, keepId: 'qa_2', removeIds: ['qa_1'] }
    expect(() => deleteDuplicates([first, inverse])).toThrow(/more than one cleanup group/i)
    expect(state.save).not.toHaveBeenCalled()
    expect(state.remove).not.toHaveBeenCalled()
  })
})
