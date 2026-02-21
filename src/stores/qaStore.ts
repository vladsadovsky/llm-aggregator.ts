import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QAPairData, QACreateData, QAUpdateData } from '../types/QAPair'
import { withRetry } from '../utils/retry'

export const useQAStore = defineStore('qa', () => {
  const pairs = ref<Record<string, QAPairData>>({})
  const selectedPairId = ref<string | null>(null)

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
    pairs.value = await withRetry(() => window.api.qaListAll())
  }

  function selectPair(id: string) {
    selectedPairId.value = id
  }

  async function createPair(data: QACreateData): Promise<QAPairData> {
    const pair = await withRetry(() => window.api.qaCreate(data))
    pairs.value[pair.id] = pair
    return pair
  }

  async function updatePair(id: string, data: QAUpdateData): Promise<QAPairData | null> {
    const pair = await withRetry(() => window.api.qaUpdate(id, data))
    if (pair) {
      pairs.value[pair.id] = pair
    }
    return pair
  }

  async function deletePair(id: string) {
    await withRetry(() => window.api.qaDelete(id))
    delete pairs.value[id]
    if (selectedPairId.value === id) {
      selectedPairId.value = null
    }
  }

  async function searchPairs(query: string, type: 'full-text' | 'tags'): Promise<string[]> {
    return withRetry(() => window.api.searchQuery(query, type))
  }

  return {
    pairs,
    selectedPairId,
    allTags,
    selectedPair,
    loadAllPairs,
    selectPair,
    createPair,
    updatePair,
    deletePair,
    searchPairs,
  }
})
