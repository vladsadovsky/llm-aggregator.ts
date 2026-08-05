<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Menu from 'primevue/menu'
import ContextMenu from 'primevue/contextmenu'
import type { MenuItem } from 'primevue/menuitem'
import { useSelectionModel } from '../composables/useSelectionModel'
import NewThreadForm from './NewThreadForm.vue'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const confirm = useConfirm()
const toast = useToast()

// Import sources — a cascading popup menu on the header's Import button. Each item
// dispatches a window event that App.vue handles (same decoupled pattern as the
// other `llm:*` app actions). Keyboard shortcuts for each source live in App.vue.
const importMenu = ref<InstanceType<typeof Menu> | null>(null)
const importItems: MenuItem[] = [
  {
    label: 'From file (.md)…',
    icon: 'pi pi-file',
    command: () => window.dispatchEvent(new Event('llm:import-file')),
  },
  {
    label: 'From shared link…',
    icon: 'pi pi-link',
    command: () => window.dispatchEvent(new Event('llm:import-shared-link')),
  },
]

function toggleImportMenu(event: Event) {
  importMenu.value?.toggle(event)
}

// ─── 1.1 filter/search/sort ──────────────────────────────────────────────────
// Independent of the QA panel's search state (uiStore); typing here never
// affects the QA list. Name mode filters thread names locally; content mode
// runs an archive-wide QA search and keeps threads whose members match.
const filterQuery = ref('')
const filterMode = ref<'name' | 'content'>('name')
const showDateFilter = ref(false)
const modeOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Content', value: 'content' },
]
const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Recent', value: 'recent' },
  { label: 'Size', value: 'size' },
]

let filterDebounce: ReturnType<typeof setTimeout> | null = null
let contentSearchSeq = 0

async function applyContentFilter() {
  threadStore.nameFilter = ''
  const q = filterQuery.value.trim()
  if (!q) {
    threadStore.setContentResults(null)
    return
  }
  const seq = (contentSearchSeq += 1)
  try {
    const ids = await qaStore.searchPairs(q, 'full-text')
    if (seq === contentSearchSeq) threadStore.setContentResults(ids)
  } catch {
    if (seq === contentSearchSeq) threadStore.setContentResults([])
  }
}

watch([filterQuery, filterMode], () => {
  if (filterDebounce) clearTimeout(filterDebounce)
  filterDebounce = setTimeout(() => {
    if (filterMode.value === 'name') {
      threadStore.nameFilter = filterQuery.value
      threadStore.setContentResults(null)
    } else {
      void applyContentFilter()
    }
  }, 200)
})

function clearAllFilters() {
  filterQuery.value = ''
  filterMode.value = 'name'
  showDateFilter.value = false
  threadStore.clearThreadFilters()
}

// ─── 1.5 collapsible tag box ─────────────────────────────────────────────────
const TAG_BOX_COLLAPSED_KEY = 'llm:threadsTagBoxCollapsed'
const tagBoxCollapsed = ref(
  typeof window !== 'undefined' && window.localStorage.getItem(TAG_BOX_COLLAPSED_KEY) === 'true',
)
function toggleTagBox() {
  tagBoxCollapsed.value = !tagBoxCollapsed.value
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TAG_BOX_COLLAPSED_KEY, String(tagBoxCollapsed.value))
  }
}

const showNewThreadInput = ref(false)
const editingThreadId = ref<string | null>(null)
const editingName = ref('')
const editingTags = ref('')
const generatingThreadTitle = ref(false)
const threadTitleSuggestionError = ref('')

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function selectThread(tid: string) {
  threadStore.selectThread(tid)
  uiStore.setLastUsedThreadId(tid)
  uiStore.showAllQAs = false
  uiStore.showUnthreaded = false
  uiStore.showGlobalSearchResults = false
  // Auto-select the first QA in the thread
  const thread = threadStore.threads[tid]
  if (thread && thread.items.length > 0) {
    qaStore.selectPair(thread.items[0])
  } else {
    qaStore.selectedPairId = null
  }
}

/** The rename editor requires a non-empty name; surfaced as a disabled action. */
const canFinishRename = computed(() => editingName.value.trim().length > 0)

function cancelNewThread() {
  showNewThreadInput.value = false
}

function cancelRename() {
  editingThreadId.value = null
  threadTitleSuggestionError.value = ''
}

async function createThread(name: string, tags: string[]) {
  const tid = await threadStore.createThread(name)
  if (tags.length > 0) {
    await threadStore.updateThread(tid, name, tags)
  }
  showNewThreadInput.value = false
  selectThread(tid)
  toast.add({ severity: 'success', summary: 'Thread created', life: 2000 })
}

/**
 * Hover text with the thread's dates. Threads created before these fields
 * existed have neither, in which case the tooltip is just the name.
 */
function threadDateTooltip(tid: string): string {
  const thread = threadStore.threads[tid]
  const format = (iso?: string): string => {
    if (!iso) return ''
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString()
  }
  const created = format(thread.createdAt)
  const updated = format(thread.updatedAt)
  const lines = [thread.name]
  if (created) lines.push(`Created: ${created}`)
  if (updated && updated !== created) lines.push(`Updated: ${updated}`)
  return lines.join('\n')
}

function startRename(tid: string) {
  editingThreadId.value = tid
  editingName.value = threadStore.threads[tid].name
  editingTags.value = (threadStore.threads[tid].tags ?? []).join(', ')
  threadTitleSuggestionError.value = ''
}

async function finishRename() {
  if (editingThreadId.value && editingName.value.trim()) {
    await threadStore.updateThread(
      editingThreadId.value,
      editingName.value.trim(),
      parseTags(editingTags.value),
    )
  }
  editingThreadId.value = null
}

async function suggestThreadTitle() {
  if (!editingThreadId.value) return
  generatingThreadTitle.value = true
  threadTitleSuggestionError.value = ''
  try {
    // This only changes the visible rename draft. The user must still choose
    // Save before the thread record is written.
    editingName.value = await window.api.aiSuggestThreadTitle(editingThreadId.value)
  } catch (err) {
    threadTitleSuggestionError.value = err instanceof Error ? err.message : 'Could not generate a thread title.'
  } finally {
    generatingThreadTitle.value = false
  }
}

function deletionMessage(threadCount: number, qaCount: number, sharedQaCount: number, sharedThreadCount: number): string {
  const threadWord = threadCount === 1 ? 'thread' : 'threads'
  const qaWord = qaCount === 1 ? 'Q&A' : 'Q&As'
  const sharedWord = sharedQaCount === 1 ? 'shared Q&A' : 'shared Q&As'
  const ownerWord = sharedThreadCount === 1 ? 'other thread' : 'other threads'
  const retained = sharedQaCount > 0
    ? ` ${sharedQaCount} ${sharedWord} will remain in ${sharedThreadCount} ${ownerWord}.`
    : ''
  return `Delete ${threadCount} ${threadWord} and ${qaCount} ${qaWord} used only by ${threadCount === 1 ? 'it' : 'them'}?${retained} This cannot be undone.`
}

async function confirmDeleteThreads(ids: string[], afterDelete?: () => void) {
  try {
    const preview = await threadStore.previewDeleteThreads(ids)
    confirm.require({
      message: deletionMessage(
        preview.threadIds.length,
        preview.qaIdsToDelete.length,
        preview.sharedQaIds.length,
        preview.sharedThreadIds.length,
      ),
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: `Delete ${preview.threadIds.length === 1 ? 'Thread' : 'Threads'} and Contents`,
      acceptClass: 'p-button-danger',
      accept: async () => {
        try {
          const result = await threadStore.deleteThreadsWithContents(ids, preview.token)
          afterDelete?.()
          toast.add({
            severity: result.cleanupPending ? 'warn' : 'info',
            summary: `${result.threadIds.length} ${result.threadIds.length === 1 ? 'thread' : 'threads'} deleted`,
            detail: result.cleanupPending
              ? 'Deletion completed, but temporary recovery files will be cleaned up on restart.'
              : `${result.qaIdsToDelete.length} unshared Q&A${result.qaIdsToDelete.length === 1 ? '' : 's'} deleted.`,
            life: result.cleanupPending ? 6000 : 3000,
          })
        } catch (err) {
          toast.add({ severity: 'error', summary: 'Delete failed', detail: (err as Error).message, life: 6000 })
        }
      },
    })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Cannot delete threads', detail: (err as Error).message, life: 7000 })
  }
}

function confirmDelete(tid: string) {
  void confirmDeleteThreads([tid])
}

async function exportThread(tid: string) {
  const result = await window.api.exportThread(tid)
  if (result) {
    const filename = result.savedPath.split(/[/\\]/).pop() ?? result.savedPath
    toast.add({ severity: 'success', summary: 'Thread exported', detail: `Saved to ${filename}`, life: 3000 })
  }
}

function selectGlobalSearchResults() {
  threadStore.selectedThreadId = null
  qaStore.selectedPairId = null
  uiStore.showAllQAs = false
  uiStore.showUnthreaded = false
  uiStore.showGlobalSearchResults = true
}

function threadMatchCount(tid: string): number {
  if (!uiStore.globalSearchResultIds) return 0
  const resultSet = new Set(uiStore.globalSearchResultIds)
  return (threadStore.threads[tid]?.items ?? []).filter((id) => resultSet.has(id)).length
}

function showAllQAs() {
  threadStore.selectedThreadId = null
  qaStore.selectedPairId = null
  uiStore.showAllQAs = true
  uiStore.showUnthreaded = false
}

function showUnthreaded() {
  threadStore.selectedThreadId = null
  uiStore.showAllQAs = false
  uiStore.showUnthreaded = true

  const firstUnthreaded = threadStore.unthreadedPairIds[0]
  if (firstUnthreaded) {
    qaStore.selectPair(firstUnthreaded)
  } else {
    qaStore.selectedPairId = null
  }
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') finishRename()
  if (e.key === 'Escape') cancelRename()
}

// ─── 3.1 multi-selection state (highlight-based) ─────────────────────────────
// Independent of the viewed thread (selectedThreadId): plain click views +
// selects one; Ctrl/Cmd and Shift extend. Pruned to the visible list.
const selection = useSelectionModel<string>()

watch(
  () => threadStore.filteredSortedThreadIds,
  (ids) => selection.prune(ids),
)

function selectAllThreads() {
  selection.selectAll(threadStore.filteredSortedThreadIds)
}

function onThreadListKeydown(e: KeyboardEvent) {
  const ids = threadStore.filteredSortedThreadIds
  if (ids.length === 0) return
  const currentIdx = threadStore.selectedThreadId ? ids.indexOf(threadStore.selectedThreadId) : -1

  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault()
    selection.selectAll(ids)
    return
  }
  if (e.key === 'Escape') {
    if (selection.selectedCount.value > 0) {
      e.preventDefault()
      selection.clear()
    }
    return
  }
  if (e.key === ' ' || e.code === 'Space') {
    if (threadStore.selectedThreadId) {
      e.preventDefault()
      selection.toggleCheckbox(threadStore.selectedThreadId)
    }
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const down = e.key === 'ArrowDown'
    if (e.shiftKey) {
      const nextIdx = Math.max(0, Math.min(ids.length - 1, currentIdx + (down ? 1 : -1)))
      const nextId = ids[nextIdx]
      selection.handleClick(nextId, ids, { shift: true })
      selectThread(nextId)
    } else {
      const nextIdx = down
        ? currentIdx < ids.length - 1
          ? currentIdx + 1
          : 0
        : currentIdx > 0
          ? currentIdx - 1
          : ids.length - 1
      const nextId = ids[nextIdx]
      selection.handleClick(nextId, ids)
      selectThread(nextId)
    }
  }
}

const hasFilters = computed(() => threadStore.activeTagFilters.length > 0)

// ─── 1.3 context menu (thread items) ─────────────────────────────────────────
const threadContextMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const contextThreadId = ref<string | null>(null)
const threadContextItems = computed<MenuItem[]>(() => {
  const tid = contextThreadId.value
  if (!tid) return []
  const count = selection.selectedCount.value
  // Bulk menu when the right-click happens inside a multi-selection.
  if (count > 1 && selection.isSelected(tid)) {
    return [
      { label: `Export ${count} selected`, icon: 'pi pi-download', command: () => void bulkExportThreads() },
      { separator: true },
      { label: `Delete ${count} selected`, icon: 'pi pi-trash', command: () => bulkDeleteThreads() },
    ]
  }
  return [
    { label: 'Rename', icon: 'pi pi-pencil', command: () => startRename(tid) },
    { label: 'Export', icon: 'pi pi-download', command: () => void exportThread(tid) },
    { separator: true },
    { label: 'Delete', icon: 'pi pi-trash', command: () => confirmDelete(tid) },
  ]
})
// Right-click is the context menu only (see QAListPanel). It selects an
// unselected row and keeps an existing multi-selection, but never extends it —
// modifier+click for that is left-button only.
function onThreadContextMenu(event: MouseEvent, tid: string) {
  if (!selection.isSelected(tid)) {
    selection.handleClick(tid, threadStore.filteredSortedThreadIds)
  }
  contextThreadId.value = tid
  threadContextMenu.value?.show(event)
}

// ─── 3.1 bulk operations (threads) ───────────────────────────────────────────
function onThreadItemClick(e: MouseEvent, tid: string) {
  const ctrl = e.ctrlKey || e.metaKey
  const shift = e.shiftKey
  if (ctrl || shift) {
    selection.handleClick(tid, threadStore.filteredSortedThreadIds, { ctrl, shift })
    return
  }
  selection.handleClick(tid, threadStore.filteredSortedThreadIds)
  selectThread(tid)
}

function bulkDeleteThreads() {
  const ids = [...selection.selectedIds.value]
  if (ids.length === 0) return
  void confirmDeleteThreads(ids, () => selection.clear())
}

async function bulkExportThreads() {
  const ids = [...selection.selectedIds.value]
  let saved = 0
  for (const tid of ids) {
    const result = await window.api.exportThread(tid)
    if (result) saved += 1
  }
  toast.add({ severity: 'success', summary: `Exported ${saved} threads`, life: 2000 })
}

function onRenameSelectedThreadRequest() {
  if (!threadStore.selectedThreadId) return
  startRename(threadStore.selectedThreadId)
}

function onNewThreadRequest() {
  showNewThreadInput.value = true
  void nextTick(() => {
    const input = document.querySelector(
      '[data-testid="new-thread-name-input"]',
    ) as HTMLInputElement | null
    input?.focus()
  })
}

onMounted(() => {
  window.addEventListener('llm:rename-selected-thread', onRenameSelectedThreadRequest)
  window.addEventListener('llm:new-thread', onNewThreadRequest)
  window.addEventListener('llm:show-all-qas', showAllQAs)
  window.addEventListener('llm:show-unthreaded', showUnthreaded)
})

onUnmounted(() => {
  window.removeEventListener('llm:rename-selected-thread', onRenameSelectedThreadRequest)
  window.removeEventListener('llm:new-thread', onNewThreadRequest)
  window.removeEventListener('llm:show-all-qas', showAllQAs)
  window.removeEventListener('llm:show-unthreaded', showUnthreaded)
  if (filterDebounce) clearTimeout(filterDebounce)
})
</script>

<template>
  <div class="threads-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <span class="panel-title">Threads</span>
        <span class="item-count">{{ threadStore.filteredSortedThreadIds.length }}</span>
      </div>
      <div class="header-actions">
        <Button
          icon="pi pi-file-import"
          text
          rounded
          size="small"
          data-testid="import-menu-button"
          title="Import…"
          aria-haspopup="true"
          @click="toggleImportMenu"
        />
        <Menu
          ref="importMenu"
          :model="importItems"
          :popup="true"
        />
        <Button
          icon="pi pi-inbox"
          text
          rounded
          size="small"
          data-testid="show-unthreaded-button"
          title="Show unthreaded QAs"
          @click="showUnthreaded"
        />
        <Button
          icon="pi pi-list"
          text
          rounded
          size="small"
          data-testid="show-all-qas-button"
          title="Show all QAs"
          @click="showAllQAs"
        />
        <Button
          v-if="threadStore.filteredSortedThreadIds.length > 0"
          icon="pi pi-check-square"
          text
          rounded
          size="small"
          title="Select all (Ctrl+A)"
          data-testid="thread-select-all"
          @click="selectAllThreads"
        />
      </div>
    </div>

    <!-- 1.1 Filter / search / sort bar -->
    <div class="thread-filter-bar">
      <div class="filter-row">
        <InputText
          v-model="filterQuery"
          :placeholder="filterMode === 'name' ? 'Filter by name…' : 'Search content…'"
          size="small"
          class="filter-input"
          data-testid="thread-filter-input"
        />
        <Select
          v-model="filterMode"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="filter-select"
          data-testid="thread-filter-mode"
        />
      </div>
      <div class="filter-row">
        <Select
          v-model="threadStore.sortBy"
          :options="sortOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="filter-select filter-select--sort"
          data-testid="thread-sort"
        />
        <Button
          icon="pi pi-calendar"
          text
          rounded
          size="small"
          :class="{ 'filter-toggle--active': showDateFilter || threadStore.dateFrom || threadStore.dateTo }"
          title="Filter by created date"
          data-testid="thread-date-toggle"
          @click="showDateFilter = !showDateFilter"
        />
        <Button
          v-if="threadStore.hasActiveThreadFilters"
          icon="pi pi-filter-slash"
          text
          rounded
          size="small"
          title="Clear all filters"
          data-testid="thread-clear-filters"
          @click="clearAllFilters"
        />
      </div>
      <div
        v-if="showDateFilter"
        class="filter-row date-row"
      >
        <input
          v-model="threadStore.dateFrom"
          type="date"
          class="date-input"
          aria-label="Created from"
          data-testid="thread-date-from"
        >
        <span class="date-sep">–</span>
        <input
          v-model="threadStore.dateTo"
          type="date"
          class="date-input"
          aria-label="Created to"
          data-testid="thread-date-to"
        >
      </div>
    </div>

    <!-- 1.5 Collapsible tag-selector box -->
    <div
      v-if="threadStore.allThreadTags.length > 0"
      class="tag-box"
    >
      <button
        class="tag-box-header"
        :aria-expanded="!tagBoxCollapsed"
        data-testid="tag-box-toggle"
        @click="toggleTagBox"
      >
        <i
          class="pi"
          :class="tagBoxCollapsed ? 'pi-chevron-right' : 'pi-chevron-down'"
        />
        <span>Tags</span>
        <span
          v-if="threadStore.activeTagFilters.length"
          class="tag-box-count"
        >{{ threadStore.activeTagFilters.length }}</span>
      </button>
      <div
        v-if="!tagBoxCollapsed"
        class="tag-filter-bar"
      >
        <button
          v-for="tag in threadStore.allThreadTags"
          :key="tag"
          class="tag-filter-chip"
          :class="{ active: threadStore.activeTagFilters.includes(tag) }"
          @click="threadStore.toggleTagFilter(tag)"
        >
          {{ tag }}
        </button>
        <button
          v-if="hasFilters"
          class="tag-filter-clear"
          title="Clear tag filters"
          @click="threadStore.clearTagFilters()"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 3.1 Bulk-action toolbar -->
    <div
      v-if="selection.selectedCount.value > 0"
      class="bulk-toolbar"
      data-testid="thread-bulk-toolbar"
    >
      <span class="bulk-count">{{ selection.selectedCount.value }} selected</span>
      <Button
        icon="pi pi-trash"
        text
        size="small"
        severity="danger"
        title="Delete selected threads"
        data-testid="thread-bulk-delete"
        @click="bulkDeleteThreads"
      />
      <Button
        icon="pi pi-download"
        text
        size="small"
        title="Export selected threads"
        @click="bulkExportThreads"
      />
      <Button
        icon="pi pi-times"
        text
        size="small"
        title="Clear selection"
        @click="selection.clear()"
      />
    </div>

    <!-- Thread list -->
    <div
      class="thread-list"
      data-testid="thread-list"
      tabindex="0"
      @keydown="onThreadListKeydown"
    >
      <!-- Global search results pseudo-entry -->
      <div
        v-if="uiStore.isGlobalSearchActive"
        class="thread-item thread-item--virtual thread-item--search-results"
        :class="{ active: uiStore.showGlobalSearchResults }"
        @click="selectGlobalSearchResults"
      >
        <div class="thread-info">
          <div class="thread-name">
            <i class="pi pi-search" />
            <span>Search Results</span>
          </div>
        </div>
        <span class="virtual-count">{{ uiStore.globalSearchResultIds?.length ?? 0 }}</span>
      </div>

      <div
        class="thread-item thread-item--virtual"
        data-testid="unthreaded-thread-item"
        :class="{ active: uiStore.showUnthreaded }"
        @click="showUnthreaded"
      >
        <div class="thread-info">
          <div class="thread-name">
            <i class="pi pi-inbox" />
            <span>Unthreaded</span>
          </div>
        </div>
        <span
          v-if="threadStore.unthreadedPairIds.length > 0"
          class="virtual-count"
        >
          {{ threadStore.unthreadedPairIds.length }}
        </span>
      </div>

      <div
        v-for="tid in threadStore.filteredSortedThreadIds"
        :key="tid"
        class="thread-item"
        :class="{ active: threadStore.selectedThreadId === tid, selected: selection.isSelected(tid) }"
        @click="onThreadItemClick($event, tid)"
        @contextmenu.prevent="onThreadContextMenu($event, tid)"
      >
        <!-- Normal display -->
        <template v-if="editingThreadId !== tid">
          <div class="thread-info">
            <div
              class="thread-name"
              :title="threadDateTooltip(tid)"
            >
              <i class="pi pi-folder" />
              <span>{{ threadStore.threads[tid].name }}</span>
            </div>
            <div
              v-if="threadStore.threads[tid].tags?.length"
              class="thread-tags"
            >
              <span
                v-for="tag in threadStore.threads[tid].tags"
                :key="tag"
                class="thread-tag"
                :class="{ 'thread-tag--active': threadStore.activeTagFilters.includes(tag) }"
                @click.stop="threadStore.toggleTagFilter(tag)"
              >{{ tag }}</span>
            </div>
          </div>
          <div class="thread-right">
            <span
              v-if="uiStore.isGlobalSearchActive && threadMatchCount(tid) > 0"
              class="match-count"
            >{{ threadMatchCount(tid) }}</span>
            <div class="thread-actions">
              <Button
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                title="Rename"
                @click.stop="startRename(tid)"
              />
              <Button
                icon="pi pi-download"
                text
                rounded
                size="small"
                data-testid="export-thread-button"
                title="Export thread to file"
                @click.stop="exportThread(tid)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                title="Delete"
                @click.stop="confirmDelete(tid)"
              />
            </div>
          </div>
        </template>

        <!-- Editing name -->
        <template v-else>
          <div
            class="edit-form"
            @click.stop
          >
            <InputText
              v-model="editingName"
              data-testid="rename-thread-name-input"
              class="edit-input"
              size="small"
              placeholder="Thread name"
              autofocus
              @keydown="onRenameKeydown"
            />
            <InputText
              v-model="editingTags"
              data-testid="rename-thread-tags-input"
              class="edit-input"
              size="small"
              placeholder="Tags (comma-separated)"
              @keydown="onRenameKeydown"
            />
            <!--
              Explicit actions rather than commit-on-blur: blur fired when moving
              to the tags field, closing the form before it could be edited.
            -->
            <div class="edit-actions">
              <Button
                label="Suggest title"
                icon="pi pi-sparkles"
                severity="secondary"
                text
                size="small"
                :loading="generatingThreadTitle"
                @click="suggestThreadTitle"
              />
              <Button
                label="Cancel"
                severity="secondary"
                text
                size="small"
                data-testid="rename-thread-cancel"
                @click="cancelRename"
              />
              <Button
                label="Save"
                size="small"
                data-testid="rename-thread-save"
                :disabled="!canFinishRename"
                @click="finishRename"
              />
            </div>
            <small
              v-if="threadTitleSuggestionError"
              class="rename-suggestion-error"
            >{{ threadTitleSuggestionError }}</small>
          </div>
        </template>
      </div>

      <div
        v-if="threadStore.filteredSortedThreadIds.length === 0 && threadStore.sortedThreadIds.length > 0"
        class="empty-state"
      >
        <i class="pi pi-filter-slash" />
        <p>No threads match</p>
        <button
          class="clear-link"
          @click="clearAllFilters"
        >
          Clear filters
        </button>
      </div>

      <div
        v-else-if="threadStore.sortedThreadIds.length === 0"
        class="empty-state"
      >
        <i class="pi pi-inbox" />
        <p>No threads yet</p>
      </div>
    </div>

    <ContextMenu
      ref="threadContextMenu"
      :model="threadContextItems"
      data-testid="thread-context-menu"
    />

    <!-- Bottom: Add thread (OneNote-style) -->
    <div class="panel-footer">
      <NewThreadForm
        v-if="showNewThreadInput"
        @submit="createThread"
        @cancel="cancelNewThread"
      />
      <!-- Hidden while the form is open: as a toggle it silently discarded typing. -->
      <button
        v-if="!showNewThreadInput"
        class="add-button"
        data-testid="add-thread-button"
        @click="showNewThreadInput = true"
      >
        <i class="pi pi-plus" />
        <span>Add thread</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.threads-panel {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--surface-ground);
  height: 100%;
  flex: 1;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  min-height: 37px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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

.thread-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-section);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.filter-input {
  flex: 1;
  min-width: 0;
}

.filter-select {
  flex-shrink: 0;
}

.filter-select--sort {
  flex: 1;
}

.filter-toggle--active {
  color: var(--primary-color);
}

.date-row {
  gap: 6px;
}

.date-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  color-scheme: light dark;
}

.date-sep {
  color: var(--text-color-secondary);
}

.tag-box {
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-section);
}

.tag-box-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;
}

.tag-box-header:hover {
  color: var(--text-color);
}

.tag-box-header i {
  font-size: 10px;
}

.tag-box-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  color: var(--primary-color);
  font-size: 10px;
}

.tag-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 8px 6px;
}

.tag-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--surface-hover);
  color: var(--text-color-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
  line-height: 1.6;
}

.tag-filter-chip:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.tag-filter-chip.active {
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  border-color: var(--primary-color);
  color: var(--primary-color);
  font-weight: 600;
}

.tag-filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 13px;
  cursor: pointer;
  margin-left: 2px;
  padding: 0;
  line-height: 1;
}

.tag-filter-clear:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.thread-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  outline: none;
}

.thread-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 7px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
  gap: 4px;
}

.thread-item:hover {
  background: var(--surface-hover);
}

/* Multi-selection: highlight-based (no checkboxes). */
.thread-item.selected {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
}

.thread-item.active {
  background: var(--highlight-bg);
  border-left-color: var(--primary-color);
}

.thread-item.active.selected {
  background: color-mix(in srgb, var(--primary-color) 28%, transparent);
}

.bulk-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-section));
}

.bulk-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
  margin-right: auto;
}

.thread-info {
  flex: 1;
  min-width: 0;
}

.thread-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thread-name span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.thread-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
  padding-left: 20px;
}

.thread-tag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--surface-hover);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
  font-size: 10px;
  line-height: 1.6;
  cursor: pointer;
  transition: all 0.12s;
}

.thread-tag:hover,
.thread-tag--active {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.thread-item--virtual .thread-name span {
  color: var(--text-color-secondary);
}

.thread-item--virtual.active .thread-name span {
  color: var(--primary-color);
}

.virtual-count {
  font-size: 11px;
  background: var(--surface-200);
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.thread-actions {
  display: none;
  gap: 2px;
  margin-top: -2px;
}

.thread-item:hover .thread-actions {
  display: flex;
}

.thread-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.match-count {
  font-size: 11px;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: var(--primary-color);
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.thread-item--search-results {
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 2px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.edit-input {
  width: 100%;
}

/* Inline rename form actions. */
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 2px;
}

.rename-suggestion-error {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--red-500);
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

.clear-link {
  margin-top: 6px;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
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

.add-button:hover {
  background: var(--surface-hover);
  color: var(--primary-color);
}

</style>
