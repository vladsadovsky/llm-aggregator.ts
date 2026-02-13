import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QACreateData } from '../types/QAPair'

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
  const searchType = ref<'full-text' | 'tags'>('full-text')
  const sortBy = ref<'date' | 'title'>('date')
  const isEditing = ref(false)
  const showAllQAs = ref(false)
  const showQAEditor = ref(false)
  const darkMode = ref(false)
  const isSidebarVisible = ref(true)

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
    showQAEditor,
    darkMode,
    toggleDarkMode,
    isSidebarVisible,
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
