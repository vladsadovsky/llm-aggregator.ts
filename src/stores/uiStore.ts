import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { QACreateData } from '../types/QAPair'

const ZOOM_STEPS = [75, 87, 100, 115, 125, 150, 175, 200, 250, 300]
const ZOOM_KEY = 'llm-aggregator.contentZoom'
const THREADS_COLLAPSED_KEY = 'llm-aggregator.threadsCollapsed'
const LIST_COLLAPSED_KEY = 'llm-aggregator.listCollapsed'

function loadZoom(key = ZOOM_KEY): number {
  if (typeof window === 'undefined') return 100
  const saved = window.localStorage.getItem(key)
  const parsed = saved ? parseInt(saved, 10) : NaN
  return ZOOM_STEPS.includes(parsed) ? parsed : 100
}

function loadBool(key: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(key) === 'true'
}

export const useUIStore = defineStore('ui', () => {
  const persistedRememberLastMetadata =
    typeof window !== 'undefined' ? window.localStorage.getItem('llm:rememberLastMetadata') : null
  const persistedLastUsedSource =
    typeof window !== 'undefined' ? window.localStorage.getItem('llm:lastUsedSource') || '' : ''
  const persistedLastUsedUrl =
    typeof window !== 'undefined' ? window.localStorage.getItem('llm:lastUsedUrl') || '' : ''
  const persistedLastUsedTagsRaw =
    typeof window !== 'undefined' ? window.localStorage.getItem('llm:lastUsedTags') : null
  let persistedLastUsedTags: string[] = []
  if (persistedLastUsedTagsRaw) {
    try {
      const parsed = JSON.parse(persistedLastUsedTagsRaw)
      if (Array.isArray(parsed)) persistedLastUsedTags = parsed.filter((t) => typeof t === 'string')
    } catch {
      persistedLastUsedTags = []
    }
  }

  const persistedLastUsedThreadId =
    typeof window !== 'undefined' ? window.localStorage.getItem('llm:lastUsedThreadId') || '' : ''

  const searchQuery = ref('')
  const searchType = ref<'full-text' | 'tags' | 'semantic'>('full-text')
  const searchScope = ref<'thread' | 'archive'>('thread')
  const globalSearchResultIds = ref<string[] | null>(null)
  const showGlobalSearchResults = ref(false)
  const isGlobalSearchActive = computed(
    () => searchScope.value === 'archive' && globalSearchResultIds.value !== null,
  )
  const sortBy = ref<'date' | 'title'>('date')
  const isEditing = ref(false)
  const showAllQAs = ref(false)
  const showUnthreaded = ref(false)
  const showQAEditor = ref(false)
  const darkMode = ref(false)
  const isSidebarVisible = ref(true)
  const contentZoom = ref<number>(loadZoom())
  const threadsCollapsed = ref<boolean>(loadBool(THREADS_COLLAPSED_KEY))
  const listCollapsed = ref<boolean>(loadBool(LIST_COLLAPSED_KEY))

  // Pane sizes (percentages)
  const sidebarWidth = ref(15)
  const listWidth = ref(25)

  // Last-used metadata for pre-filling QA forms
  const lastUsedSource = ref(persistedLastUsedSource)
  const lastUsedTags = ref<string[]>(persistedLastUsedTags)
  const lastUsedUrl = ref(persistedLastUsedUrl)
  const rememberLastMetadata = ref(persistedRememberLastMetadata !== '0')
  const lastUsedThreadId = ref(persistedLastUsedThreadId)
  const qaEditorDraft = ref<Partial<QACreateData> | null>(null)
  const qaEditorTargetThreadId = ref<string | null>(null)

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
    if (darkMode.value) {
      document.documentElement.classList.add('dark-mode')
    } else {
      document.documentElement.classList.remove('dark-mode')
    }
  }

  function zoomIn() {
    const idx = ZOOM_STEPS.indexOf(contentZoom.value)
    if (idx < ZOOM_STEPS.length - 1) {
      contentZoom.value = ZOOM_STEPS[idx + 1]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ZOOM_KEY, String(contentZoom.value))
      }
    }
  }

  function zoomOut() {
    const idx = ZOOM_STEPS.indexOf(contentZoom.value)
    if (idx > 0) {
      contentZoom.value = ZOOM_STEPS[idx - 1]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ZOOM_KEY, String(contentZoom.value))
      }
    }
  }

  function zoomReset() {
    contentZoom.value = 100
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ZOOM_KEY, '100')
    }
  }

  function toggleThreads() {
    threadsCollapsed.value = !threadsCollapsed.value
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THREADS_COLLAPSED_KEY, String(threadsCollapsed.value))
    }
  }

  function setThreadsCollapsed(value: boolean) {
    threadsCollapsed.value = value
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THREADS_COLLAPSED_KEY, String(value))
    }
  }

  function toggleList() {
    listCollapsed.value = !listCollapsed.value
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LIST_COLLAPSED_KEY, String(listCollapsed.value))
    }
  }

  function setListCollapsed(value: boolean) {
    listCollapsed.value = value
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LIST_COLLAPSED_KEY, String(value))
    }
  }

  function setLastUsedMetadata(source: string, tags: string[], url: string) {
    if (rememberLastMetadata.value) {
      lastUsedSource.value = source
      lastUsedTags.value = tags
      lastUsedUrl.value = url
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('llm:lastUsedSource', source)
        window.localStorage.setItem('llm:lastUsedTags', JSON.stringify(tags))
        window.localStorage.setItem('llm:lastUsedUrl', url)
      }
    }
  }

  function getLastUsedMetadata() {
    return {
      source: lastUsedSource.value,
      tags: lastUsedTags.value,
      url: lastUsedUrl.value
    }
  }

  function setLastUsedThreadId(threadId: string) {
    lastUsedThreadId.value = threadId
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('llm:lastUsedThreadId', threadId)
    }
  }

  function setRememberLastMetadata(value: boolean) {
    rememberLastMetadata.value = value
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('llm:rememberLastMetadata', value ? '1' : '0')
    }
  }

  function clearLastUsedMetadata() {
    lastUsedSource.value = ''
    lastUsedTags.value = []
    lastUsedUrl.value = ''
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('llm:lastUsedSource')
      window.localStorage.removeItem('llm:lastUsedTags')
      window.localStorage.removeItem('llm:lastUsedUrl')
    }
  }

  function openQAEditorWithDraft(draft: Partial<QACreateData>, targetThreadId: string | null = null) {
    qaEditorDraft.value = draft
    qaEditorTargetThreadId.value = targetThreadId
    showQAEditor.value = true
  }

  function clearQAEditorDraft() {
    qaEditorDraft.value = null
    qaEditorTargetThreadId.value = null
  }

  return {
    searchQuery,
    searchType,
    sortBy,
    isEditing,
    showAllQAs,
    showUnthreaded,
    showGlobalSearchResults,
    globalSearchResultIds,
    searchScope,
    isGlobalSearchActive,
    showQAEditor,
    darkMode,
    toggleDarkMode,
    isSidebarVisible,
    contentZoom,
    threadsCollapsed,
    listCollapsed,
    zoomIn,
    zoomOut,
    zoomReset,
    toggleThreads,
    setThreadsCollapsed,
    toggleList,
    setListCollapsed,
    sidebarWidth,
    listWidth,
    lastUsedSource,
    lastUsedTags,
    lastUsedUrl,
    rememberLastMetadata,
    lastUsedThreadId,
    qaEditorDraft,
    qaEditorTargetThreadId,
    setLastUsedMetadata,
    getLastUsedMetadata,
    setLastUsedThreadId,
    setRememberLastMetadata,
    clearLastUsedMetadata,
    openQAEditorWithDraft,
    clearQAEditorDraft,
  }
})
