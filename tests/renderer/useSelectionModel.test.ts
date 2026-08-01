/**
 * Phase 0.3: one selection model, exercised through every click modifier,
 * range direction, checkbox, select-all, prune, and clear. Pins that selection
 * stays visible-only, that primary/anchor follow the documented rules, and that
 * pruning (reload/filter/delete/archive switch) never leaves dangling ids.
 */
import { describe, it, expect } from 'vitest'
import { useSelectionModel } from '../../src/composables/useSelectionModel'

const VISIBLE = ['a', 'b', 'c', 'd', 'e']

describe('useSelectionModel', () => {
  it('plain click selects one and sets primary + anchor', () => {
    const s = useSelectionModel()
    s.handleClick('c', VISIBLE)
    expect([...s.selectedIds.value]).toEqual(['c'])
    expect(s.primaryId.value).toBe('c')
    expect(s.anchorId.value).toBe('c')
    expect(s.selectedCount.value).toBe(1)
  })

  it('plain click replaces a previous selection', () => {
    const s = useSelectionModel()
    s.handleClick('a', VISIBLE)
    s.handleClick('d', VISIBLE)
    expect([...s.selectedIds.value]).toEqual(['d'])
    expect(s.primaryId.value).toBe('d')
  })

  it('ctrl-click toggles membership and moves primary/anchor to the clicked row', () => {
    const s = useSelectionModel()
    s.handleClick('a', VISIBLE)
    s.handleClick('c', VISIBLE, { ctrl: true })
    expect([...s.selectedIds.value]).toEqual(['a', 'c'])
    expect(s.primaryId.value).toBe('c')
    expect(s.anchorId.value).toBe('c')

    s.handleClick('a', VISIBLE, { ctrl: true }) // toggle 'a' off
    expect([...s.selectedIds.value]).toEqual(['c'])
    expect(s.isSelected('a')).toBe(false)
  })

  it('ctrl-clicking the primary off moves primary to the last remaining selection', () => {
    const s = useSelectionModel()
    s.handleClick('a', VISIBLE)
    s.handleClick('b', VISIBLE, { ctrl: true })
    s.handleClick('b', VISIBLE, { ctrl: true }) // remove primary 'b'
    expect([...s.selectedIds.value]).toEqual(['a'])
    expect(s.primaryId.value).toBe('a')
  })

  it('shift-click selects the contiguous visible range from the anchor (forward)', () => {
    const s = useSelectionModel()
    s.handleClick('b', VISIBLE) // anchor = b
    s.handleClick('d', VISIBLE, { shift: true })
    expect([...s.selectedIds.value]).toEqual(['b', 'c', 'd'])
    expect(s.primaryId.value).toBe('d')
    expect(s.anchorId.value).toBe('b') // anchor preserved
  })

  it('shift-click ranges backward too, and re-extends from the same anchor', () => {
    const s = useSelectionModel()
    s.handleClick('d', VISIBLE) // anchor = d
    s.handleClick('b', VISIBLE, { shift: true })
    expect([...s.selectedIds.value]).toEqual(['b', 'c', 'd'])
    // re-extend from anchor d to a
    s.handleClick('a', VISIBLE, { shift: true })
    expect([...s.selectedIds.value]).toEqual(['a', 'b', 'c', 'd'])
    expect(s.anchorId.value).toBe('d')
  })

  it('shift-click with no anchor falls back to a plain single select', () => {
    const s = useSelectionModel()
    s.handleClick('c', VISIBLE, { shift: true })
    expect([...s.selectedIds.value]).toEqual(['c'])
    expect(s.anchorId.value).toBe('c')
  })

  it('range uses the CURRENT visible order (re-filtered list)', () => {
    const s = useSelectionModel()
    s.handleClick('a', VISIBLE) // anchor a
    const filtered = ['a', 'c', 'e'] // b, d filtered out
    s.handleClick('e', filtered, { shift: true })
    expect([...s.selectedIds.value]).toEqual(['a', 'c', 'e'])
  })

  it('checkbox toggle adds/removes without disturbing primary or anchor', () => {
    const s = useSelectionModel()
    s.handleClick('c', VISIBLE) // primary = anchor = c
    s.toggleCheckbox('a')
    s.toggleCheckbox('e')
    expect([...s.selectedIds.value]).toEqual(['c', 'a', 'e'])
    expect(s.primaryId.value).toBe('c') // unchanged
    expect(s.anchorId.value).toBe('c')
    s.toggleCheckbox('a') // remove
    expect(s.isSelected('a')).toBe(false)
    expect(s.primaryId.value).toBe('c')
  })

  it('select-all selects every visible row and only visible rows', () => {
    const s = useSelectionModel()
    const filtered = ['b', 'd']
    s.selectAll(filtered)
    expect([...s.selectedIds.value]).toEqual(['b', 'd'])
    expect(s.selectedCount.value).toBe(2)
  })

  it('select-all on an empty visible list clears primary/anchor', () => {
    const s = useSelectionModel()
    s.handleClick('a', VISIBLE)
    s.selectAll([])
    expect([...s.selectedIds.value]).toEqual([])
    expect(s.primaryId.value).toBeNull()
    expect(s.anchorId.value).toBeNull()
  })

  it('prune drops ids no longer present and nulls a vanished primary/anchor', () => {
    const s = useSelectionModel()
    s.handleClick('b', VISIBLE)
    s.handleClick('d', VISIBLE, { ctrl: true }) // selected b,d; primary/anchor d
    s.prune(['a', 'b', 'c']) // d removed
    expect([...s.selectedIds.value]).toEqual(['b'])
    expect(s.primaryId.value).toBeNull()
    expect(s.anchorId.value).toBeNull()
  })

  it('prune keeps a still-present primary/anchor', () => {
    const s = useSelectionModel()
    s.handleClick('b', VISIBLE)
    s.toggleCheckbox('d')
    s.prune(['a', 'b', 'c']) // d removed, b kept
    expect([...s.selectedIds.value]).toEqual(['b'])
    expect(s.primaryId.value).toBe('b')
  })

  it('clear resets everything (archive switch)', () => {
    const s = useSelectionModel()
    s.selectAll(VISIBLE)
    s.clear()
    expect([...s.selectedIds.value]).toEqual([])
    expect(s.primaryId.value).toBeNull()
    expect(s.anchorId.value).toBeNull()
    expect(s.selectedCount.value).toBe(0)
  })

  it('two models are independent (per-list selection never leaks)', () => {
    const qa = useSelectionModel()
    const threads = useSelectionModel()
    qa.handleClick('a', VISIBLE)
    threads.handleClick('c', VISIBLE)
    expect([...qa.selectedIds.value]).toEqual(['a'])
    expect([...threads.selectedIds.value]).toEqual(['c'])
  })
})
