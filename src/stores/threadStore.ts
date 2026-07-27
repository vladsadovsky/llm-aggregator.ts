import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ThreadMap, ThreadData } from '../types/Thread'
import { useQAStore } from './qaStore'
import { debugLog, debugError } from '../utils/logger'
import { withRetry } from '../utils/retry'

export const useThreadStore = defineStore('threads', () => {
  const threads = ref<ThreadMap>({})
  const selectedThreadId = ref<string | null>(null)
  const activeTagFilters = ref<string[]>([])

  const selectedThread = computed<ThreadData | null>(() => {
    if (!selectedThreadId.value) return null
    return threads.value[selectedThreadId.value] || null
  })

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

  const filteredSortedThreadIds = computed(() => {
    if (activeTagFilters.value.length === 0) return sortedThreadIds.value
    return sortedThreadIds.value.filter((threadId) => {
      const tags = threads.value[threadId].tags ?? []
      return activeTagFilters.value.some((filterTag) => tags.includes(filterTag))
    })
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

  /**
   * `options.createdAt` lets importers date a thread from its source conversation
   * instead of the moment of import; the thread id is derived from the same
   * instant so ids stay chronological.
   */
  async function createThread(name: string, options: { createdAt?: string } = {}): Promise<string> {
    const parsed = options.createdAt ? Date.parse(options.createdAt) : NaN
    const now = Number.isNaN(parsed) ? new Date() : new Date(parsed)
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

    debugLog('threadStore', 'createThread start', { tid, name })
    const stamp = now.toISOString()
    threads.value[tid] = { name, items: [], createdAt: stamp, updatedAt: stamp }
    await save()
    debugLog('threadStore', 'createThread completed', { tid, thread: threads.value[tid] })
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
    selectedThread,
    sortedThreadIds,
    allThreadTags,
    unthreadedPairIds,
    filteredSortedThreadIds,
    loadThreads,
    createThread,
    renameThread,
    updateThread,
    setThreadTimes,
    deleteThread,
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
