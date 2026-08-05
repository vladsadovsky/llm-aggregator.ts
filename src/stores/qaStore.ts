import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QAPairData, QACreateData, QAUpdateData } from '../types/QAPair'
import { withRetry } from '../utils/retry'
import type { ArchiveLoadProgress } from '../global'

const FAVORITES_KEY = 'llm:favoritePairIds'
const RECENT_KEY = 'llm:recentPairIds'
const RECENT_LIMIT = 25

function readStoredIds(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export const useQAStore = defineStore('qa', () => {
  const pairs = ref<Record<string, QAPairData>>({})
  const selectedPairId = ref<string | null>(null)
  const favoritePairIds = ref<string[]>(readStoredIds(FAVORITES_KEY))
  const recentPairIds = ref<string[]>(readStoredIds(RECENT_KEY))
  const isLoading = ref(false)
  const loadProgress = ref<ArchiveLoadProgress | null>(null)
  let loadSequence = 0

  // Extract all unique tags across all QA pairs, sorted by frequency
  const allTags = computed(() => {
    const tagCounts: Record<string, number> = {}
    for (const pair of Object.values(pairs.value as Record<string, QAPairData>)) {
      if (pair.tags) {
        for (const tag of pair.tags) {
          const normalized = tag.trim().toLowerCase()
          if (normalized) {
            tagCounts[normalized] = (tagCounts[normalized] || 0) + 1
          }
        }
      }
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  })

  function selectedPair(): QAPairData | null {
    if (!selectedPairId.value) return null
    return pairs.value[selectedPairId.value] || null
  }

  async function loadAllPairs() {
    const sequence = ++loadSequence
    isLoading.value = true
    loadProgress.value = null
    const unsubscribe = window.api.onArchiveLoadProgress((progress) => {
      if (sequence === loadSequence) loadProgress.value = progress
    })
    try {
      const loaded = await withRetry(() => window.api.qaListAll())
      if (sequence === loadSequence) {
        pairs.value = loaded
        pruneStoredIds()
        if (selectedPairId.value && !pairs.value[selectedPairId.value]) {
          selectedPairId.value = null
        }
      }
    } finally {
      unsubscribe()
      if (sequence === loadSequence) {
        isLoading.value = false
        loadProgress.value = null
      }
    }
  }

  function selectPair(id: string) {
    selectedPairId.value = id
    recentPairIds.value = [id, ...recentPairIds.value.filter((recentId) => recentId !== id)].slice(0, RECENT_LIMIT)
    persistRecent()
  }

  function toggleFavorite(id: string) {
    favoritePairIds.value = favoritePairIds.value.includes(id)
      ? favoritePairIds.value.filter((favoriteId) => favoriteId !== id)
      : [...favoritePairIds.value, id]
    persistFavorites()
  }

  function persistFavorites() {
    if (typeof window !== 'undefined') window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritePairIds.value))
  }

  function persistRecent() {
    if (typeof window !== 'undefined') window.localStorage.setItem(RECENT_KEY, JSON.stringify(recentPairIds.value))
  }

  function pruneStoredIds() {
    const known = new Set(Object.keys(pairs.value))
    favoritePairIds.value = favoritePairIds.value.filter((id) => known.has(id))
    recentPairIds.value = recentPairIds.value.filter((id) => known.has(id))
    persistFavorites()
    persistRecent()
  }

  /**
   * An IPC rejection does not prove that a mutating main-process operation did
   * not commit: Electron can lose the response after a durable write. Never
   * replay a create/update/delete blindly; replace renderer state from disk and
   * let the caller report the original failure.
   */
  async function reconcileAfterMutationFailure() {
    try {
      await loadAllPairs()
    } catch {
      // Preserve the original mutation error. A later reload remains available
      // if the archive cannot be read while handling this failure.
    }
  }

  async function createPair(data: QACreateData): Promise<QAPairData> {
    try {
      const pair = await window.api.qaCreate(data)
      pairs.value[pair.id] = pair
      return pair
    } catch (error) {
      await reconcileAfterMutationFailure()
      throw error
    }
  }

  async function updatePair(id: string, data: QAUpdateData): Promise<QAPairData | null> {
    try {
      const pair = await window.api.qaUpdate(id, data)
      if (pair) {
        pairs.value[pair.id] = pair
      }
      return pair
    } catch (error) {
      await reconcileAfterMutationFailure()
      throw error
    }
  }

  async function deletePair(id: string) {
    try {
      await window.api.qaDelete(id)
      delete pairs.value[id]
      pruneStoredIds()
      if (selectedPairId.value === id) {
        selectedPairId.value = null
      }
    } catch (error) {
      await reconcileAfterMutationFailure()
      throw error
    }
  }

  async function searchPairs(query: string, type: 'full-text' | 'tags' | 'semantic'): Promise<string[]> {
    if (type === 'semantic') {
      return withRetry(() => window.api.searchSemantic(query, 20))
    }
    return withRetry(() => window.api.searchQuery(query, type))
  }

  return {
    pairs,
    selectedPairId,
    favoritePairIds,
    recentPairIds,
    isLoading,
    loadProgress,
    allTags,
    selectedPair,
    loadAllPairs,
    selectPair,
    toggleFavorite,
    createPair,
    updatePair,
    deletePair,
    searchPairs,
  }
})
