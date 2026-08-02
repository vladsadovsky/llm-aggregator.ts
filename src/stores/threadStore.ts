import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ThreadMap, ThreadData } from '../types/Thread'
import { useQAStore } from './qaStore'
import { debugLog, debugError } from '../utils/logger'
import { withRetry } from '../utils/retry'
import type { RedundantThreadGroup } from '../../shared/threads/redundantThreadGroups'

export const useThreadStore = defineStore('threads', () => {
  const threads = ref<ThreadMap>({})
  const selectedThreadId = ref<string | null>(null)
  const activeTagFilters = ref<string[]>([])

  // ─── 1.1 thread list filter/search/sort (independent of the QA-panel state) ──
  /** Substring match on thread name. */
  const nameFilter = ref('')
  /** Inclusive createdAt calendar-day range (YYYY-MM-DD); '' means unbounded. */
  const dateFrom = ref('')
  const dateTo = ref('')
  /** Thread list ordering. */
  const sortBy = ref<'name' | 'recent' | 'size'>('name')
  /**
   * QA-id set from a content search (`qaStore.searchPairs`), or null when content
   * search is inactive. A thread matches when any of its items is in the set. The
   * async search itself is driven by the panel; the store only holds the result
   * so `filteredSortedThreadIds` stays synchronous and testable.
   */
  const contentResultIds = ref<string[] | null>(null)

  const selectedThread = computed<ThreadData | null>(() => {
    if (!selectedThreadId.value) return null
    return threads.value[selectedThreadId.value] || null
  })

  // Base alphabetical order. Kept stable because QAEditor's thread picker relies
  // on it; the panel's configurable sort lives in `filteredSortedThreadIds`.
  const sortedThreadIds = computed(() => {
    return Object.keys(threads.value).sort((a, b) => {
      return threads.value[a].name.localeCompare(threads.value[b].name)
    })
  })

  const allThreadTags = computed<string[]>(() => {
    const tagSet = new Set<string>()
    for (const thread of Object.values(threads.value)) {
      for (const tag of thread.tags ?? []) {
        tagSet.add(tag)
      }
    }
    return [...tagSet].sort((a, b) => a.localeCompare(b))
  })

  const unthreadedPairIds = computed<string[]>(() => {
    const qaStore = useQAStore()
    const allThreadedIds = new Set(Object.values(threads.value).flatMap((thread) => thread.items))
    return Object.keys(qaStore.pairs).filter((id) => !allThreadedIds.has(id))
  })

  /** True when any thread-list filter (tags, name, date, content) is active. */
  const hasActiveThreadFilters = computed(
    () =>
      activeTagFilters.value.length > 0 ||
      nameFilter.value.trim().length > 0 ||
      dateFrom.value !== '' ||
      dateTo.value !== '' ||
      contentResultIds.value !== null,
  )

  function threadComparator(a: string, b: string): number {
    const ta = threads.value[a]
    const tb = threads.value[b]
    if (sortBy.value === 'recent') {
      const ua = ta.updatedAt ?? ta.createdAt ?? ''
      const ub = tb.updatedAt ?? tb.createdAt ?? ''
      if (ua !== ub) return ub.localeCompare(ua) // newest first
      return ta.name.localeCompare(tb.name)
    }
    if (sortBy.value === 'size') {
      const d = tb.items.length - ta.items.length // largest first
      if (d !== 0) return d
      return ta.name.localeCompare(tb.name)
    }
    return ta.name.localeCompare(tb.name)
  }

  /** How many of a thread's items are in the active content-search result set. */
  function threadContentMatchCount(tid: string): number {
    if (contentResultIds.value === null) return 0
    const set = new Set(contentResultIds.value)
    return (threads.value[tid]?.items ?? []).filter((id) => set.has(id)).length
  }

  const filteredSortedThreadIds = computed(() => {
    const nameNeedle = nameFilter.value.trim().toLowerCase()
    const contentSet = contentResultIds.value === null ? null : new Set(contentResultIds.value)
    return Object.keys(threads.value)
      .filter((tid) => {
        const thread = threads.value[tid]
        // Tags (OR semantics, unchanged).
        if (activeTagFilters.value.length > 0) {
          const tags = thread.tags ?? []
          if (!activeTagFilters.value.some((f) => tags.includes(f))) return false
        }
        // Name substring.
        if (nameNeedle && !thread.name.toLowerCase().includes(nameNeedle)) return false
        // createdAt calendar-day range.
        if (dateFrom.value || dateTo.value) {
          const day = (thread.createdAt ?? '').slice(0, 10)
          if (!day) return false
          if (dateFrom.value && day < dateFrom.value) return false
          if (dateTo.value && day > dateTo.value) return false
        }
        // Content search: any member QA in the result set.
        if (contentSet && !thread.items.some((id) => contentSet.has(id))) return false
        return true
      })
      .sort(threadComparator)
  })

  function toggleTagFilter(tag: string) {
    const index = activeTagFilters.value.indexOf(tag)
    if (index === -1) {
      activeTagFilters.value.push(tag)
    } else {
      activeTagFilters.value.splice(index, 1)
    }
  }

  function clearTagFilters() {
    activeTagFilters.value = []
  }

  /** Set (or clear, with null) the content-search result set the panel computed. */
  function setContentResults(ids: string[] | null) {
    contentResultIds.value = ids
  }

  /** Clear every thread-list filter at once. */
  function clearThreadFilters() {
    activeTagFilters.value = []
    nameFilter.value = ''
    dateFrom.value = ''
    dateTo.value = ''
    contentResultIds.value = null
  }

  async function loadThreads() {
    threads.value = await withRetry(() => window.api.threadsLoad())
  }

  async function save() {
    // Strip Vue reactivity proxy before sending through Electron IPC
    const plain = JSON.parse(JSON.stringify(toRaw(threads.value))) as ThreadMap
    debugLog('threadStore', 'save called, keys:', Object.keys(plain))
    try {
      await withRetry(() => window.api.threadsSave(plain))
      debugLog('threadStore', 'save completed')
    } catch (err) {
      debugError('threadStore', 'save FAILED:', err)
      throw err
    }
  }

  /**
   * Stamp a thread as edited. Every mutation below calls this before saving, so
   * `updatedAt` means "last entry or edit" rather than only "time of import".
   */
  function touch(tid: string) {
    const thread = threads.value[tid]
    if (thread) thread.updatedAt = new Date().toISOString()
  }

  function allocateThreadId(now: Date): string {
    const y = now.getFullYear()
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    let tid = `thread_${y}${mo}${d}_${h}${mi}${s}`
    // Second-resolution ids collide when several source conversations start in
    // the same second; walk forward until one is free.
    for (let i = 1; threads.value[tid] && i < 5000; i += 1) {
      const next = new Date(now.getTime() + i * 1000)
      const p = (n: number): string => String(n).padStart(2, '0')
      tid =
        `thread_${next.getFullYear()}${p(next.getMonth() + 1)}${p(next.getDate())}_` +
        `${p(next.getHours())}${p(next.getMinutes())}${p(next.getSeconds())}`
    }
    return tid
  }

  /**
   * `options.createdAt` lets importers date a thread from its source conversation
   * instead of the moment of import; the thread id is derived from the same
   * instant so ids stay chronological.
   */
  async function createThread(name: string, options: { createdAt?: string } = {}): Promise<string> {
    const parsed = options.createdAt ? Date.parse(options.createdAt) : NaN
    const now = Number.isNaN(parsed) ? new Date() : new Date(parsed)
    const tid = allocateThreadId(now)

    debugLog('threadStore', 'createThread start', { tid, name })
    const stamp = now.toISOString()
    threads.value[tid] = { name, items: [], createdAt: stamp, updatedAt: stamp }
    await save()
    debugLog('threadStore', 'createThread completed', { tid, thread: threads.value[tid] })
    return tid
  }

  /**
   * Create an already-populated thread in one durable map save. Import must not
   * expose an empty thread and then rely on N later saves to attach N QAs.
   */
  async function createThreadWithItems(
    name: string,
    pairIds: readonly string[],
    options: { createdAt?: string; tags?: readonly string[] } = {},
  ): Promise<string> {
    const parsed = options.createdAt ? Date.parse(options.createdAt) : NaN
    const now = Number.isNaN(parsed) ? new Date() : new Date(parsed)
    const tid = allocateThreadId(now)
    const stamp = now.toISOString()
    debugLog('threadStore', 'createThreadWithItems start', {
      tid,
      requestedItemIds: pairIds,
    })
    threads.value[tid] = {
      name,
      items: [...new Set(pairIds)],
      ...(options.tags && options.tags.length > 0 ? { tags: [...new Set(options.tags)] } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    }
    await save()
    debugLog('threadStore', 'createThreadWithItems completed', {
      tid,
      persistedItemIds: threads.value[tid]?.items ?? [],
    })
    return tid
  }

  async function renameThread(tid: string, newName: string) {
    if (threads.value[tid]) {
      threads.value[tid].name = newName
      touch(tid)
      await save()
    }
  }

  async function updateThread(tid: string, name: string, tags: string[]) {
    if (threads.value[tid]) {
      debugLog('threadStore', 'updateThread start', { tid, name, tags })
      threads.value[tid].name = name
      threads.value[tid].tags = tags.length > 0 ? tags : undefined
      touch(tid)
      await save()
      debugLog('threadStore', 'updateThread completed', { tid, thread: threads.value[tid] })
    }
  }

  /**
   * Set a thread's dates explicitly. Importers call this *after* filling the
   * thread: `addToThread` and friends stamp `updatedAt` with "now", which would
   * otherwise overwrite the source conversation's own time.
   */
  async function setThreadTimes(tid: string, times: { createdAt?: string; updatedAt?: string }) {
    const thread = threads.value[tid]
    if (!thread) return
    if (times.createdAt) thread.createdAt = times.createdAt
    if (times.updatedAt) thread.updatedAt = times.updatedAt
    await save()
  }

  async function deleteThread(tid: string) {
    if (threads.value[tid]) {
      delete threads.value[tid]
      if (selectedThreadId.value === tid) {
        selectedThreadId.value = null
      }
      await save()
    }
  }

  async function repairRedundantThreads(groups: readonly RedundantThreadGroup[]) {
    if (groups.length === 0) return { mergedGroups: 0, removedThreadIds: [] as string[] }
    // Do not automatically replay a destructive request: main may have durably
    // committed it even if the renderer never received the response.
    const result = await window.api.threadsRepairRedundant(groups.map((group) => ({
      itemIds: [...group.itemIds],
      survivorId: group.survivorId,
      redundantIds: [...group.redundantIds],
    })))
    // Main validated a fresh on-disk snapshot and promoted it atomically. Only
    // now replace renderer state, so a failed save leaves the UI truthful.
    threads.value = result.threads
    if (selectedThreadId.value && result.removedThreadIds.includes(selectedThreadId.value)) {
      const merged = groups.find((group) => group.redundantIds.includes(selectedThreadId.value!))
      selectedThreadId.value = merged?.survivorId ?? null
    }
    return { mergedGroups: result.mergedGroups, removedThreadIds: result.removedThreadIds }
  }

  function selectThread(tid: string) {
    selectedThreadId.value = tid
  }

  async function addToThread(tid: string, pairId: string) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      debugLog('threadStore', 'addToThread attempt', {
        tid,
        pairId,
        itemCountBefore: items.length,
        alreadyPresent: items.includes(pairId),
      })
      if (!items.includes(pairId)) {
        items.push(pairId)
        touch(tid)
        await save()
        debugLog('threadStore', 'addToThread completed', {
          tid,
          pairId,
          itemCountAfter: items.length,
        })
      }
    } else {
      debugError('threadStore', 'addToThread: thread not found', { tid, pairId })
    }
  }

  async function removeFromThread(tid: string, pairId: string) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      const idx = items.indexOf(pairId)
      if (idx !== -1) {
        items.splice(idx, 1)
        touch(tid)
        await save()
      }
    }
  }

  function threadsContaining(pairId: string): { id: string; name: string }[] {
    return Object.entries(threads.value)
      .filter(([, thread]) => thread.items.includes(pairId))
      .map(([id, thread]) => ({ id, name: thread.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function threadsNotContaining(pairId: string): { id: string; name: string }[] {
    return Object.entries(threads.value)
      .filter(([, thread]) => !thread.items.includes(pairId))
      .map(([id, thread]) => ({ id, name: thread.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function moveToThread(fromTid: string, toTid: string, pairId: string) {
    if (threads.value[toTid] && !threads.value[toTid].items.includes(pairId)) {
      threads.value[toTid].items.push(pairId)
      touch(toTid)
    }
    if (threads.value[fromTid]) {
      const index = threads.value[fromTid].items.indexOf(pairId)
      if (index !== -1) {
        threads.value[fromTid].items.splice(index, 1)
        touch(fromTid)
      }
    }
    await save()
  }

  async function moveInThread(tid: string, pairId: string, direction: number) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      const idx = items.indexOf(pairId)
      if (idx !== -1) {
        const newIdx = idx + direction
        if (newIdx >= 0 && newIdx < items.length) {
          ;[items[idx], items[newIdx]] = [items[newIdx], items[idx]]
          touch(tid)
          await save()
        }
      }
    }
  }

  async function moveToStartOfThread(tid: string, pairId: string) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      const idx = items.indexOf(pairId)
      if (idx > 0) {
        items.splice(idx, 1)
        items.unshift(pairId)
        touch(tid)
        await save()
      }
    }
  }

  async function moveToEndOfThread(tid: string, pairId: string) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      const idx = items.indexOf(pairId)
      if (idx !== -1 && idx < items.length - 1) {
        items.splice(idx, 1)
        items.push(pairId)
        touch(tid)
        await save()
      }
    }
  }

  return {
    threads,
    selectedThreadId,
    activeTagFilters,
    nameFilter,
    dateFrom,
    dateTo,
    sortBy,
    contentResultIds,
    hasActiveThreadFilters,
    threadContentMatchCount,
    setContentResults,
    clearThreadFilters,
    selectedThread,
    sortedThreadIds,
    allThreadTags,
    unthreadedPairIds,
    filteredSortedThreadIds,
    loadThreads,
    createThread,
    createThreadWithItems,
    renameThread,
    updateThread,
    setThreadTimes,
    deleteThread,
    repairRedundantThreads,
    selectThread,
    addToThread,
    removeFromThread,
    threadsContaining,
    threadsNotContaining,
    moveToThread,
    moveInThread,
    moveToStartOfThread,
    moveToEndOfThread,
    toggleTagFilter,
    clearTagFilters,
  }
})
