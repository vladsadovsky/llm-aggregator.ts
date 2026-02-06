import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QAPairData, QACreateData, QAUpdateData } from '../types/QAPair'

export const useQAStore = defineStore('qa', () => {
  const pairs = ref<Record<string, QAPairData>>({})
  const selectedPairId = ref<string | null>(null)

  function selectedPair(): QAPairData | null {
    if (!selectedPairId.value) return null
    return pairs.value[selectedPairId.value] || null
  }

  async function loadAllPairs() {
    pairs.value = await window.api.qaListAll()
  }

  function selectPair(id: string) {
    selectedPairId.value = id
  }

  async function createPair(data: QACreateData): Promise<QAPairData> {
    const pair = await window.api.qaCreate(data)
    pairs.value[pair.id] = pair
    return pair
  }

  async function updatePair(id: string, data: QAUpdateData): Promise<QAPairData | null> {
    const pair = await window.api.qaUpdate(id, data)
    if (pair) {
      pairs.value[pair.id] = pair
    }
    return pair
  }

  async function deletePair(id: string) {
    await window.api.qaDelete(id)
    delete pairs.value[id]
    if (selectedPairId.value === id) {
      selectedPairId.value = null
    }
  }

  async function searchPairs(query: string, type: 'full-text' | 'tags'): Promise<string[]> {
    return window.api.searchQuery(query, type)
  }

  return {
    pairs,
    selectedPairId,
    selectedPair,
    loadAllPairs,
    selectPair,
    createPair,
    updatePair,
    deletePair,
    searchPairs,
  }
})
