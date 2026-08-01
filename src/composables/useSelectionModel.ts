/**
 * Phase 0.3 — shared, reusable multi-selection model.
 *
 * A single tested implementation of Ctrl/Cmd-click toggle, Shift-click range,
 * checkbox toggle, and select-all, usable by both the QA list and the thread
 * list. It is independent of the existing single active-detail item
 * (`selectedPairId` / `selectedThreadId`): those keep pointing at the primary
 * row, and existing single-item commands act only on `primaryId`, so nothing
 * becomes implicitly bulk-destructive (INV-ARCHIVE keeps selection per-list;
 * callers must `clear()` on archive switch).
 *
 * The caller passes the currently *visible* (filter-matching) ordered id list to
 * the interaction methods, so range and select-all only ever touch visible rows.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface ClickModifiers {
  /** Ctrl (Win/Linux) or Cmd (macOS): toggle the clicked row and make it primary/anchor. */
  ctrl?: boolean
  /** Shift: select the contiguous visible range from the anchor to the clicked row. */
  shift?: boolean
}

export interface SelectionModel<TId> {
  /** Selected ids, in the order they were added / in visible order for ranges. */
  readonly selectedIds: ComputedRef<readonly TId[]>
  /** The active row — the last plainly/ctrl-clicked or range-endpoint row. */
  readonly primaryId: ComputedRef<TId | null>
  /** The fixed endpoint a Shift-range extends from. */
  readonly anchorId: ComputedRef<TId | null>
  readonly selectedCount: ComputedRef<number>
  isSelected(id: TId): boolean
  /** Route a list-row click; dispatches to plain / ctrl-toggle / shift-range. */
  handleClick(id: TId, visibleIds: readonly TId[], modifiers?: ClickModifiers): void
  /** Checkbox toggle: add/remove without disturbing primary or anchor. */
  toggleCheckbox(id: TId): void
  /** Select every currently visible (filter-matching) row. */
  selectAll(visibleIds: readonly TId[]): void
  /** Clear all selection state (call on archive switch). */
  clear(): void
  /** Drop any selected/primary/anchor id no longer present (reload/filter/delete). */
  prune(presentIds: readonly TId[]): void
}

export function useSelectionModel<TId = string>(): SelectionModel<TId> {
  const selected = ref<TId[]>([]) as Ref<TId[]>
  const primary = ref<TId | null>(null) as Ref<TId | null>
  const anchor = ref<TId | null>(null) as Ref<TId | null>

  const selectedSet = computed(() => new Set(selected.value))
  const isSelected = (id: TId) => selectedSet.value.has(id)

  function selectOnly(id: TId) {
    selected.value = [id]
    primary.value = id
    anchor.value = id
  }

  function toggle(id: TId, makePrimary: boolean) {
    if (selectedSet.value.has(id)) {
      selected.value = selected.value.filter((x) => x !== id)
      // Removing the primary leaves primary pointing at nothing selected; move it
      // to the last remaining selection for a predictable active row.
      if (makePrimary || primary.value === id) {
        primary.value = selected.value.length ? selected.value[selected.value.length - 1] : null
      }
    } else {
      selected.value = [...selected.value, id]
      if (makePrimary) primary.value = id
    }
    if (makePrimary) anchor.value = id
  }

  function selectRange(id: TId, visibleIds: readonly TId[]) {
    const from = anchor.value
    const start = from === null ? -1 : visibleIds.indexOf(from)
    const end = visibleIds.indexOf(id)
    if (start === -1 || end === -1) {
      // No usable anchor (or off-list) — fall back to a plain single select.
      selectOnly(id)
      return
    }
    const [lo, hi] = start <= end ? [start, end] : [end, start]
    selected.value = visibleIds.slice(lo, hi + 1)
    primary.value = id
    // Anchor is intentionally preserved so successive Shift-clicks re-extend from it.
  }

  function handleClick(id: TId, visibleIds: readonly TId[], modifiers: ClickModifiers = {}) {
    if (modifiers.shift) selectRange(id, visibleIds)
    else if (modifiers.ctrl) toggle(id, true)
    else selectOnly(id)
  }

  function toggleCheckbox(id: TId) {
    toggle(id, false)
  }

  function selectAll(visibleIds: readonly TId[]) {
    selected.value = [...visibleIds]
    if (visibleIds.length === 0) {
      primary.value = null
      anchor.value = null
    } else {
      if (primary.value === null || !visibleIds.includes(primary.value)) primary.value = visibleIds[0]
      if (anchor.value === null || !visibleIds.includes(anchor.value)) anchor.value = visibleIds[0]
    }
  }

  function clear() {
    selected.value = []
    primary.value = null
    anchor.value = null
  }

  function prune(presentIds: readonly TId[]) {
    const present = new Set(presentIds)
    selected.value = selected.value.filter((id) => present.has(id))
    if (primary.value !== null && !present.has(primary.value)) primary.value = null
    if (anchor.value !== null && !present.has(anchor.value)) anchor.value = null
  }

  return {
    selectedIds: computed(() => selected.value as readonly TId[]),
    primaryId: computed(() => primary.value),
    anchorId: computed(() => anchor.value),
    selectedCount: computed(() => selected.value.length),
    isSelected,
    handleClick,
    toggleCheckbox,
    selectAll,
    clear,
    prune,
  }
}
