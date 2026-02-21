import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ThreadMap, ThreadData } from '../types/Thread'
import { debugLog, debugError } from '../utils/logger'
import { withRetry } from '../utils/retry'

export const useThreadStore = defineStore('threads', () => {
  const threads = ref<ThreadMap>({})
  const selectedThreadId = ref<string | null>(null)

  const selectedThread = computed<ThreadData | null>(() => {
    if (!selectedThreadId.value) return null
    return threads.value[selectedThreadId.value] || null
  })

  const sortedThreadIds = computed(() => {
    return Object.keys(threads.value).sort((a, b) => {
      return threads.value[a].name.localeCompare(threads.value[b].name)
    })
  })

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

  return {
    threads,
    selectedThreadId,
    selectedThread,
    sortedThreadIds,
    loadThreads,
    createThread,
    renameThread,
    deleteThread,
    selectThread,
    addToThread,
    removeFromThread,
    moveInThread,
  }
})
