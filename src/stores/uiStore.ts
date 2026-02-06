import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const searchQuery = ref('')
  const searchType = ref<'full-text' | 'tags'>('full-text')
  const sortBy = ref<'date' | 'title'>('date')
  const isEditing = ref(false)
  const showAllQAs = ref(false)
  const darkMode = ref(false)

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
    if (darkMode.value) {
      document.documentElement.classList.add('dark-mode')
    } else {
      document.documentElement.classList.remove('dark-mode')
    }
  }

  return {
    searchQuery,
    searchType,
    sortBy,
    isEditing,
    showAllQAs,
    darkMode,
    toggleDarkMode,
  }
})
