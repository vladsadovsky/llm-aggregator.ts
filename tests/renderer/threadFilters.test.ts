/**
 * 1.1: independent thread-list filter/search/sort. Pins name/date/tag/content
 * filtering and name/recent/size ordering in filteredSortedThreadIds, and that
 * the base sortedThreadIds (used by QAEditor) stays alphabetical regardless.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useThreadStore } from '../../src/stores/threadStore'
import type { ThreadMap } from '../../src/types/Thread'

let store: ReturnType<typeof useThreadStore>

const MAP: ThreadMap = {
  t_beta: { name: 'Beta project', items: ['q1', 'q2'], createdAt: '2026-03-10T09:00:00Z', updatedAt: '2026-03-20T09:00:00Z', tags: ['work'] },
  t_alpha: { name: 'Alpha notes', items: ['q3'], createdAt: '2026-01-05T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z', tags: ['personal'] },
  t_gamma: { name: 'Gamma research', items: ['q4', 'q5', 'q6'], createdAt: '2026-04-15T09:00:00Z', updatedAt: '2026-04-16T09:00:00Z', tags: ['work', 'research'] },
}

beforeEach(() => {
  store = useThreadStore()
  store.threads = JSON.parse(JSON.stringify(MAP))
  store.clearThreadFilters()
  store.sortBy = 'name'
})

describe('sortedThreadIds (base, alphabetical) stays stable for QAEditor', () => {
  it('is always alphabetical regardless of sortBy', () => {
    expect(store.sortedThreadIds).toEqual(['t_alpha', 't_beta', 't_gamma'])
    store.sortBy = 'size'
    expect(store.sortedThreadIds).toEqual(['t_alpha', 't_beta', 't_gamma'])
  })
})

describe('sorting in filteredSortedThreadIds', () => {
  it('by name (default)', () => {
    expect(store.filteredSortedThreadIds).toEqual(['t_alpha', 't_beta', 't_gamma'])
  })
  it('by recent (updatedAt desc)', () => {
    store.sortBy = 'recent'
    // updatedAt: alpha 05-01, gamma 04-16, beta 03-20
    expect(store.filteredSortedThreadIds).toEqual(['t_alpha', 't_gamma', 't_beta'])
  })
  it('by size (items.length desc, name tiebreak)', () => {
    store.sortBy = 'size'
    expect(store.filteredSortedThreadIds).toEqual(['t_gamma', 't_beta', 't_alpha'])
  })
})

describe('name filter', () => {
  it('substring, case-insensitive', () => {
    store.nameFilter = 'alpha'
    expect(store.filteredSortedThreadIds).toEqual(['t_alpha'])
    store.nameFilter = 'PROJECT'
    expect(store.filteredSortedThreadIds).toEqual(['t_beta'])
  })
})

describe('date range on createdAt', () => {
  it('inclusive from/to', () => {
    store.dateFrom = '2026-03-01'
    store.dateTo = '2026-04-30'
    expect(store.filteredSortedThreadIds).toEqual(['t_beta', 't_gamma']) // created 03-10, 04-15
  })
  it('from only', () => {
    store.dateFrom = '2026-04-01'
    expect(store.filteredSortedThreadIds).toEqual(['t_gamma'])
  })
})

describe('tag filter (unchanged OR semantics)', () => {
  it('matches any active tag', () => {
    store.activeTagFilters = ['research']
    expect(store.filteredSortedThreadIds).toEqual(['t_gamma'])
    store.activeTagFilters = ['work']
    expect(store.filteredSortedThreadIds).toEqual(['t_beta', 't_gamma'])
  })
})

describe('content search results', () => {
  it('keeps threads whose items intersect the result set', () => {
    store.setContentResults(['q5', 'q1'])
    expect(store.filteredSortedThreadIds).toEqual(['t_beta', 't_gamma'])
  })
  it('threadContentMatchCount counts member hits', () => {
    store.setContentResults(['q4', 'q5', 'q1'])
    expect(store.threadContentMatchCount('t_gamma')).toBe(2)
    expect(store.threadContentMatchCount('t_beta')).toBe(1)
    expect(store.threadContentMatchCount('t_alpha')).toBe(0)
  })
  it('null result set disables content filtering', () => {
    store.setContentResults(null)
    expect(store.filteredSortedThreadIds).toHaveLength(3)
  })
})

describe('combined filters + hasActiveThreadFilters + clear', () => {
  it('applies name AND date AND content together', () => {
    store.nameFilter = 'a' // alpha, beta(Beta), gamma all contain 'a'
    store.dateFrom = '2026-03-01'
    store.setContentResults(['q2'])
    expect(store.filteredSortedThreadIds).toEqual(['t_beta'])
  })
  it('hasActiveThreadFilters reflects any active filter', () => {
    expect(store.hasActiveThreadFilters).toBe(false)
    store.nameFilter = 'x'
    expect(store.hasActiveThreadFilters).toBe(true)
  })
  it('clearThreadFilters resets everything', () => {
    store.nameFilter = 'x'
    store.dateFrom = '2026-01-01'
    store.activeTagFilters = ['work']
    store.setContentResults(['q1'])
    store.clearThreadFilters()
    expect(store.hasActiveThreadFilters).toBe(false)
    expect(store.filteredSortedThreadIds).toHaveLength(3)
  })
})
