import { describe, expect, it } from 'vitest'
import type { ThreadMap } from '../../src/types/Thread'
import { planThreadDeletion } from '../../shared/threads/threadDeletionPlan'

describe('planThreadDeletion', () => {
  it('deletes each QA owned only by the selected set exactly once', () => {
    const threads: ThreadMap = {
      a: { name: 'A', items: ['qa1', 'qa2', 'qa2'] },
      b: { name: 'B', items: ['qa2', 'qa3'] },
    }
    const plan = planThreadDeletion(threads, ['b', 'a', 'a'])
    expect(plan.threadIds).toEqual(['a', 'b'])
    expect(plan.candidateQaIds).toEqual(['qa1', 'qa2', 'qa3'])
    expect(plan.sharedQaIds).toEqual([])
  })

  it('preserves QAs referenced by surviving threads and reports those owners', () => {
    const threads: ThreadMap = {
      selected: { name: 'Selected', items: ['private', 'shared'] },
      survivor: { name: 'Survivor', items: ['shared'] },
    }
    const plan = planThreadDeletion(threads, ['selected'])
    expect(plan.candidateQaIds).toEqual(['private'])
    expect(plan.sharedQaIds).toEqual(['shared'])
    expect(plan.sharedThreadIds).toEqual(['survivor'])
  })

  it('protects a complete redundant-wrapper group', () => {
    const threads: ThreadMap = {
      copy1: { name: 'Same', items: ['qa1'] },
      copy2: { name: 'Same', items: ['qa1'] },
    }
    expect(planThreadDeletion(threads, ['copy1', 'copy2']).blockedRedundantGroups).toEqual([{
      threadIds: ['copy1', 'copy2'], itemIds: ['qa1'],
    }])
  })

  it('allows deleting only one redundant wrapper while preserving its shared QA', () => {
    const threads: ThreadMap = {
      copy1: { name: 'Same', items: ['qa1'] },
      copy2: { name: 'Same', items: ['qa1'] },
    }
    const plan = planThreadDeletion(threads, ['copy1'])
    expect(plan.blockedRedundantGroups).toEqual([])
    expect(plan.candidateQaIds).toEqual([])
    expect(plan.sharedQaIds).toEqual(['qa1'])
  })

  it('reports missing thread ids instead of broadening the operation', () => {
    const plan = planThreadDeletion({ a: { name: 'A', items: [] } }, ['missing', 'a'])
    expect(plan.threadIds).toEqual(['a'])
    expect(plan.missingThreadIds).toEqual(['missing'])
  })
})
