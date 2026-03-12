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

  async function createThread(name: string): Promise<string> {
    const now = new Date()
    const y = now.getFullYear()
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const tid = `thread_${y}${mo}${d}_${h}${mi}${s}`

    threads.value[tid] = { name, items: [] }
    await save()
    return tid
  }

  async function renameThread(tid: string, newName: string) {
    if (threads.value[tid]) {
      threads.value[tid].name = newName
      await save()
    }
  }

  async function updateThread(tid: string, name: string, tags: string[]) {
    if (threads.value[tid]) {
      threads.value[tid].name = name
      threads.value[tid].tags = tags.length > 0 ? tags : undefined
      await save()
    }
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
      if (!items.includes(pairId)) {
        items.push(pairId)
        await save()
      }
    }
  }

  async function removeFromThread(tid: string, pairId: string) {
    if (threads.value[tid]) {
      const items = threads.value[tid].items
      const idx = items.indexOf(pairId)
      if (idx !== -1) {
        items.splice(idx, 1)
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
    }
    if (threads.value[fromTid]) {
      const index = threads.value[fromTid].items.indexOf(pairId)
      if (index !== -1) {
        threads.value[fromTid].items.splice(index, 1)
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
