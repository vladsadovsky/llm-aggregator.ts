<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'

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

const newThreadName = ref('')
const newThreadTags = ref('')
const showNewThreadInput = ref(false)
const editingThreadId = ref<string | null>(null)
const editingName = ref('')
const editingTags = ref('')

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

/** Both inline editors require a non-empty name; surfaced as a disabled action. */
const canCreateThread = computed(() => newThreadName.value.trim().length > 0)
const canFinishRename = computed(() => editingName.value.trim().length > 0)

function cancelNewThread() {
  showNewThreadInput.value = false
  newThreadName.value = ''
  newThreadTags.value = ''
}

function cancelRename() {
  editingThreadId.value = null
}

async function createThread() {
  const name = newThreadName.value.trim()
  if (!name) return
  const tags = parseTags(newThreadTags.value)
  const tid = await threadStore.createThread(name)
  if (tags.length > 0) {
    await threadStore.updateThread(tid, name, tags)
  }
  newThreadName.value = ''
  newThreadTags.value = ''
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

function confirmDelete(tid: string) {
  confirm.require({
    message: `Delete thread "${threadStore.threads[tid].name}"?`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await threadStore.deleteThread(tid)
      toast.add({ severity: 'info', summary: 'Thread deleted', life: 2000 })
    },
  })
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

function onNewThreadKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') createThread()
  if (e.key === 'Escape') cancelNewThread()
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') finishRename()
  if (e.key === 'Escape') cancelRename()
}

function onThreadListKeydown(e: KeyboardEvent) {
  const ids = threadStore.filteredSortedThreadIds
  if (ids.length === 0) return
  const currentIdx = threadStore.selectedThreadId ? ids.indexOf(threadStore.selectedThreadId) : -1

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = currentIdx < ids.length - 1 ? currentIdx + 1 : 0
    selectThread(ids[next])
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = currentIdx > 0 ? currentIdx - 1 : ids.length - 1
    selectThread(ids[prev])
  }
}

const hasFilters = computed(() => threadStore.activeTagFilters.length > 0)

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
})
</script>

<template>
  <div class="threads-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">Threads</span>
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
      </div>
    </div>

    <div
      v-if="threadStore.allThreadTags.length > 0"
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
        title="Clear all filters"
        @click="threadStore.clearTagFilters()"
      >
        ×
      </button>
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
        :class="{ active: threadStore.selectedThreadId === tid }"
        @click="selectThread(tid)"
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
          @click="threadStore.clearTagFilters()"
        >
          Clear filter
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

    <!-- Bottom: Add thread (OneNote-style) -->
    <div class="panel-footer">
      <div
        v-if="showNewThreadInput"
        class="new-thread-inputs"
      >
        <InputText
          v-model="newThreadName"
          data-testid="new-thread-name-input"
          placeholder="Thread name..."
          size="small"
          class="w-full"
          autofocus
          @keydown="onNewThreadKeydown"
        />
        <InputText
          v-model="newThreadTags"
          data-testid="new-thread-tags-input"
          placeholder="Tags (comma-separated)"
          size="small"
          class="w-full"
          @keydown="onNewThreadKeydown"
        />
        <div class="edit-actions">
          <Button
            label="Cancel"
            severity="secondary"
            text
            size="small"
            data-testid="new-thread-cancel"
            @click="cancelNewThread"
          />
          <Button
            label="Create"
            size="small"
            data-testid="new-thread-create"
            :disabled="!canCreateThread"
            @click="createThread"
          />
        </div>
      </div>
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
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--border-color);
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

.tag-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--surface-section);
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

.thread-item.active {
  background: var(--highlight-bg);
  border-left-color: var(--primary-color);
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

/* Shared by the inline "new thread" and "rename thread" forms. */
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 2px;
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

.new-thread-inputs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 8px 4px;
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

.w-full {
  width: 100%;
}
</style>
