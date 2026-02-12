import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
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
  const lastUsedSource = ref('')
  const lastUsedTags = ref<string[]>([])
  const lastUsedUrl = ref('')
  const rememberLastMetadata = ref(true)

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
    }
  }

  function getLastUsedMetadata() {
    return {
      source: lastUsedSource.value,
      tags: lastUsedTags.value,
      url: lastUsedUrl.value
    }
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
    setLastUsedMetadata,
    getLastUsedMetadata,
  }
})
