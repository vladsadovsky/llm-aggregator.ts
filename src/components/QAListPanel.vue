<script setup lang="ts">
import { computed, ref } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import QAEditor from './QAEditor.vue'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const toast = useToast()

const showEditor = ref(false)
const searchResults = ref<string[] | null>(null)

// Items displayed in the list
const displayedItems = computed(() => {
  // All QAs mode
  if (uiStore.showAllQAs) {
    let items = Object.keys(qaStore.pairs)

    // Apply search filter
    if (searchResults.value !== null) {
      items = items.filter((id) => searchResults.value!.includes(id))
    }

    // Sort
    if (uiStore.sortBy === 'date') {
      items.sort((a, b) => {
        const ta = qaStore.pairs[a]?.timestamp || ''
        const tb = qaStore.pairs[b]?.timestamp || ''
        return tb.localeCompare(ta)
      })
    } else {
      items.sort((a, b) => {
        const tA = qaStore.pairs[a]?.title?.toLowerCase() || ''
        const tB = qaStore.pairs[b]?.title?.toLowerCase() || ''
        return tA.localeCompare(tB)
      })
    }
    return items
  }

  // Thread mode
  if (!threadStore.selectedThreadId) return []
  const thread = threadStore.threads[threadStore.selectedThreadId]
  if (!thread) return []
  return thread.items.filter((id) => id in qaStore.pairs)
})

const panelTitle = computed(() => {
  if (uiStore.showAllQAs) return 'All QAs'
  if (!threadStore.selectedThreadId) return 'Select a thread'
  const thread = threadStore.threads[threadStore.selectedThreadId]
  return thread?.name || 'Thread'
})

function selectPair(id: string) {
  qaStore.selectPair(id)
  uiStore.isEditing = false
}

async function doSearch() {
  if (!uiStore.searchQuery.trim()) {
    searchResults.value = null
    return
  }
  searchResults.value = await qaStore.searchPairs(uiStore.searchQuery, uiStore.searchType)
}

function clearSearch() {
  uiStore.searchQuery = ''
  searchResults.value = null
}

async function onQACreated(pairId: string) {
  showEditor.value = false
  if (threadStore.selectedThreadId) {
    await threadStore.addToThread(threadStore.selectedThreadId, pairId)
  }
  qaStore.selectPair(pairId)
  toast.add({ severity: 'success', summary: 'QA created', life: 2000 })
}

function getQuestionSnippet(id: string): string {
  const pair = qaStore.pairs[id]
  if (!pair) return ''
  return pair.question.length > 80 ? pair.question.substring(0, 80) + '...' : pair.question
}
</script>

<template>
  <div class="qa-list-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">{{ panelTitle }}</span>
      <span class="item-count">{{ displayedItems.length }}</span>
    </div>

    <!-- Search bar (shown in All QAs mode) -->
    <div v-if="uiStore.showAllQAs" class="search-bar">
      <div class="search-row">
        <InputText
          v-model="uiStore.searchQuery"
          placeholder="Search..."
          size="small"
          class="search-input"
          @keydown.enter="doSearch"
        />
        <Button
          icon="pi pi-search"
          size="small"
          text
          rounded
          @click="doSearch"
        />
        <Button
          v-if="searchResults !== null"
          icon="pi pi-times"
          size="small"
          text
          rounded
          @click="clearSearch"
        />
      </div>
      <div class="search-options">
        <Select
          v-model="uiStore.searchType"
          :options="[
            { label: 'Full text', value: 'full-text' },
            { label: 'Tags', value: 'tags' },
          ]"
          optionLabel="label"
          optionValue="value"
          size="small"
          class="search-type-select"
        />
        <Select
          v-model="uiStore.sortBy"
          :options="[
            { label: 'By date', value: 'date' },
            { label: 'By title', value: 'title' },
          ]"
          optionLabel="label"
          optionValue="value"
          size="small"
          class="sort-select"
        />
      </div>
    </div>

    <!-- QA list -->
    <div class="qa-list">
      <div
        v-for="id in displayedItems"
        :key="id"
        class="qa-item"
        :class="{ active: qaStore.selectedPairId === id }"
        @click="selectPair(id)"
      >
        <div class="qa-item-title">
          <i class="pi pi-file" />
          <span>{{ qaStore.pairs[id]?.title || 'Untitled' }}</span>
        </div>
        <div class="qa-item-snippet">{{ getQuestionSnippet(id) }}</div>
        <div class="qa-item-meta">
          <span v-if="qaStore.pairs[id]?.source" class="qa-source">
            {{ qaStore.pairs[id].source }}
          </span>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="displayedItems.length === 0" class="empty-state">
        <template v-if="uiStore.showAllQAs">
          <i class="pi pi-search" />
          <p>No QAs found</p>
        </template>
        <template v-else-if="!threadStore.selectedThreadId">
          <i class="pi pi-arrow-left" />
          <p>Select a thread</p>
        </template>
        <template v-else>
          <i class="pi pi-file" />
          <p>No QAs in this thread</p>
        </template>
      </div>
    </div>

    <!-- QA Editor dialog -->
    <QAEditor
      v-if="showEditor"
      @created="onQACreated"
      @cancel="showEditor = false"
    />

    <!-- Bottom: Add QA (OneNote "Add page" style) -->
    <div class="panel-footer">
      <button
        class="add-button"
        :disabled="!threadStore.selectedThreadId && !uiStore.showAllQAs"
        @click="showEditor = true"
      >
        <i class="pi pi-plus" />
        <span>Add QA</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.qa-list-panel {
  width: 300px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--surface-card);
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--border-color);
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.item-count {
  font-size: 11px;
  background: var(--surface-200);
  padding: 2px 8px;
  border-radius: 10px;
  color: var(--text-color-secondary);
}

.search-bar {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input {
  flex: 1;
}

.search-options {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.search-type-select,
.sort-select {
  flex: 1;
  font-size: 11px;
}

.qa-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.qa-item {
  padding: 10px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
}

.qa-item:hover {
  background: var(--surface-hover);
}

.qa-item.active {
  background: var(--highlight-bg);
  border-left-color: var(--primary-color);
}

.qa-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.qa-item-title span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qa-item-snippet {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.qa-item-meta {
  margin-top: 4px;
}

.qa-source {
  font-size: 10px;
  background: var(--surface-200);
  padding: 1px 6px;
  border-radius: 8px;
  color: var(--text-color-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.empty-state i {
  font-size: 24px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.panel-footer {
  border-top: 1px solid var(--border-color);
  padding: 4px;
}

.add-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color-secondary);
  transition: all 0.15s ease;
}

.add-button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--primary-color);
}

.add-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
