import { describe, it, expect } from 'vitest'
import {
  findRedundantThreadGroups,
  planThreadMerge,
} from '../../shared/threads/redundantThreadGroups'
import type { ThreadMap } from '../../src/types/Thread'

function makeThread(
  items: string[],
  opts: {
    importSourceId?: string
    tags?: string[]
    createdAt?: string
    updatedAt?: string
    name?: string
  } = {},
) {
  return {
    name: opts.name ?? 'Test Thread',
    items,
    tags: opts.tags ?? [],
    createdAt: opts.createdAt ?? '2026-04-10T15:41:49.000Z',
    updatedAt: opts.updatedAt ?? '2026-04-10T15:41:49.000Z',
    ...(opts.importSourceId ? { importSourceId: opts.importSourceId } : {}),
  }
}

// ─── findRedundantThreadGroups ───────────────────────────────────────────────

describe('findRedundantThreadGroups', () => {
  it('returns no groups when all item sets differ', () => {
    const threads: ThreadMap = {
      t1: makeThread(['a']),
      t2: makeThread(['b']),
      t3: makeThread(['c']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(0)
  })

  it('groups threads with identical item sets', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1']),
      t2: makeThread(['qa1']),
    }
    const groups = findRedundantThreadGroups(threads)
    expect(groups).toHaveLength(1)
    expect(groups[0].threadIds).toHaveLength(2)
    expect(groups[0].redundantIds).toHaveLength(1)
  })

  it('groups by exact set match regardless of item order', () => {
    const threads: ThreadMap = {
      t1: makeThread(['b', 'a']),
      t2: makeThread(['a', 'b']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(1)
  })

  it('deduplicates repeated item ids within a thread before fingerprinting', () => {
    const threads: ThreadMap = {
      t1: makeThread(['a', 'a']),
      t2: makeThread(['a']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(1)
  })

  it('excludes threads with zero items', () => {
    const threads: ThreadMap = {
      t1: makeThread([]),
      t2: makeThread([]),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(0)
  })

  it('does not report a single-member group', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(0)
  })

  it('picks the importSourceId carrier as survivor when exactly one carries it', () => {
    const threads: ThreadMap = {
      thread_20260410_154150: makeThread(['qa1']),
      thread_20260410_154149: makeThread(['qa1'], {
        importSourceId: 'claude-account-export:abc',
      }),
      thread_20260410_154151: makeThread(['qa1']),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.survivorId).toBe('thread_20260410_154149')
  })

  it('tie-breaks to lexicographically smallest id when no thread carries importSourceId', () => {
    const threads: ThreadMap = {
      thread_20260410_154151: makeThread(['qa1']),
      thread_20260410_154149: makeThread(['qa1']),
      thread_20260410_154150: makeThread(['qa1']),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.survivorId).toBe('thread_20260410_154149')
  })

  it('tie-breaks to smallest id when multiple threads carry importSourceId', () => {
    const threads: ThreadMap = {
      thread_20260410_154151: makeThread(['qa1'], { importSourceId: 'src:b' }),
      thread_20260410_154149: makeThread(['qa1'], { importSourceId: 'src:a' }),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.survivorId).toBe('thread_20260410_154149')
  })

  it('handles multiple independent redundant groups', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1']),
      t2: makeThread(['qa1']),
      t3: makeThread(['qa2']),
      t4: makeThread(['qa2']),
      t5: makeThread(['qa3']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(2)
  })

  it('places the survivor first in threadIds', () => {
    const threads: ThreadMap = {
      thread_20260410_154152: makeThread(['qa1']),
      thread_20260410_154149: makeThread(['qa1'], {
        importSourceId: 'claude-account-export:abc',
      }),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.threadIds[0]).toBe(group.survivorId)
  })

  it('itemIds are the sorted, deduped items', () => {
    const threads: ThreadMap = {
      t1: makeThread(['z', 'a', 'a']),
      t2: makeThread(['a', 'z']),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.itemIds).toEqual(['a', 'z'])
  })

  it('does not collide delimiter-containing ids with a multi-item set', () => {
    const threads: ThreadMap = {
      t1: makeThread(['a', 'b']),
      t2: makeThread(['a|b']),
    }
    expect(findRedundantThreadGroups(threads)).toHaveLength(0)
  })

  it('reports distinct import identities as an unsafe conflict', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { importSourceId: 'source:one' }),
      t2: makeThread(['qa1'], { importSourceId: 'source:two' }),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(group.importSourceIds).toEqual(['source:one', 'source:two'])
    expect(() => planThreadMerge(threads, group)).toThrow(/multiple import identities/i)
  })

  // Characterization fixture matching the 5-group/15-redundant shape from the real archive
  it('characterization: 5 groups, 15 redundant threads out of 1256 total', () => {
    const threads: ThreadMap = {}
    const qaIds = ['qa_a', 'qa_b', 'qa_c', 'qa_d', 'qa_e']

    // 5 redundant groups × 4 threads each; first thread in each group carries importSourceId
    for (let g = 0; g < 5; g++) {
      const qa = qaIds[g]
      for (let i = 0; i < 4; i++) {
        const id = `thread_2026041${g}_15414${i}`
        threads[id] = makeThread([qa], i === 0 ? { importSourceId: `src:${g}` } : {})
      }
    }
    // fill remaining slots with unique threads
    for (let i = 20; i < 1256; i++) {
      threads[`thread_unique_${i}`] = makeThread([`unique_qa_${i}`])
    }

    const groups = findRedundantThreadGroups(threads)
    expect(groups).toHaveLength(5)
    const redundantCount = groups.reduce((n, g) => n + g.redundantIds.length, 0)
    expect(redundantCount).toBe(15)
    // Each group's survivor should be the importSourceId carrier (index 0 = smallest id)
    for (const group of groups) {
      expect(threads[group.survivorId]?.importSourceId).toBeTruthy()
    }
  })
})

// ─── planThreadMerge ─────────────────────────────────────────────────────────

describe('planThreadMerge', () => {
  it('unions tags from all members', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { tags: ['claude', 'bulk'] }),
      t2: makeThread(['qa1'], { tags: ['bulk', 'extra'] }),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.mergedFields.tags.sort()).toEqual(['bulk', 'claude', 'extra'])
  })

  it('picks the earliest createdAt', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { createdAt: '2026-04-10T15:41:50.000Z' }),
      t2: makeThread(['qa1'], { createdAt: '2026-04-10T15:41:49.000Z' }),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.mergedFields.createdAt).toBe('2026-04-10T15:41:49.000Z')
  })

  it('picks the latest updatedAt', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { updatedAt: '2026-04-10T15:41:49.000Z' }),
      t2: makeThread(['qa1'], { updatedAt: '2026-04-10T15:41:52.000Z' }),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.mergedFields.updatedAt).toBe('2026-04-10T15:41:52.000Z')
  })

  it('redundantIds excludes the survivor', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1']),
      t2: makeThread(['qa1']),
      t3: makeThread(['qa1']),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.redundantIds).not.toContain(plan.survivorId)
    expect(plan.redundantIds).toHaveLength(2)
  })

  it('survivorId matches the group survivor', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { importSourceId: 'src:1' }),
      t2: makeThread(['qa1']),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.survivorId).toBe(group.survivorId)
  })

  it('produces empty tags when all members have no tags', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1']),
      t2: makeThread(['qa1']),
    }
    const [group] = findRedundantThreadGroups(threads)
    const plan = planThreadMerge(threads, group)
    expect(plan.mergedFields.tags).toEqual([])
  })

  it('is deterministic when every timestamp is absent', () => {
    const threads: ThreadMap = {
      t1: { name: 'A', items: ['qa1'] },
      t2: { name: 'A', items: ['qa1'] },
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(planThreadMerge(threads, group).mergedFields).toEqual({
      tags: [], createdAt: undefined, updatedAt: undefined,
    })
  })

  it('compares valid timestamps chronologically and ignores malformed legacy values', () => {
    const threads: ThreadMap = {
      t1: makeThread(['qa1'], { createdAt: 'not-a-date', updatedAt: 'not-a-date' }),
      t2: makeThread(['qa1'], {
        createdAt: '2026-01-01T00:00:00-08:00',
        updatedAt: '2026-01-02T00:00:00-08:00',
      }),
    }
    const [group] = findRedundantThreadGroups(threads)
    expect(planThreadMerge(threads, group).mergedFields).toMatchObject({
      createdAt: '2026-01-01T00:00:00-08:00',
      updatedAt: '2026-01-02T00:00:00-08:00',
    })
  })
})
