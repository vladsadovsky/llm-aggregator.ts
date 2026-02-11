<script setup lang="ts">
import { ref } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const confirm = useConfirm()
const toast = useToast()

const newThreadName = ref('')
const showNewThreadInput = ref(false)
const editingThreadId = ref<string | null>(null)
const editingName = ref('')

function selectThread(tid: string) {
  threadStore.selectThread(tid)
  uiStore.showAllQAs = false
  // Auto-select the first QA in the thread
  const thread = threadStore.threads[tid]
  if (thread && thread.items.length > 0) {
    qaStore.selectPair(thread.items[0])
  } else {
    qaStore.selectedPairId = null
  }
}

async function createThread() {
  const name = newThreadName.value.trim()
  if (!name) return
  const tid = await threadStore.createThread(name)
  newThreadName.value = ''
  showNewThreadInput.value = false
  selectThread(tid)
  toast.add({ severity: 'success', summary: 'Thread created', life: 2000 })
}

function startRename(tid: string) {
  editingThreadId.value = tid
  editingName.value = threadStore.threads[tid].name
}

async function finishRename() {
  if (editingThreadId.value && editingName.value.trim()) {
    await threadStore.renameThread(editingThreadId.value, editingName.value.trim())
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

function showAllQAs() {
  threadStore.selectedThreadId = null
  qaStore.selectedPairId = null
  uiStore.showAllQAs = true
}

function onNewThreadKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') createThread()
  if (e.key === 'Escape') {
    showNewThreadInput.value = false
    newThreadName.value = ''
  }
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') finishRename()
  if (e.key === 'Escape') editingThreadId.value = null
}

function onThreadListKeydown(e: KeyboardEvent) {
  const ids = threadStore.sortedThreadIds
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
</script>

<template>
  <div class="threads-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">Threads</span>
      <Button
        icon="pi pi-list"
        text
        rounded
        size="small"
        title="Show all QAs"
        @click="showAllQAs"
      />
    </div>

    <!-- Thread list -->
    <div class="thread-list" tabindex="0" @keydown="onThreadListKeydown">
      <div
        v-for="tid in threadStore.sortedThreadIds"
        :key="tid"
        class="thread-item"
        :class="{ active: threadStore.selectedThreadId === tid }"
        @click="selectThread(tid)"
      >
        <!-- Normal display -->
        <template v-if="editingThreadId !== tid">
          <div class="thread-name">
            <i class="pi pi-folder" />
            <span>{{ threadStore.threads[tid].name }}</span>
          </div>
          <div class="thread-actions">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              @click.stop="startRename(tid)"
              title="Rename"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              size="small"
              severity="danger"
              @click.stop="confirmDelete(tid)"
              title="Delete"
            />
          </div>
        </template>

        <!-- Editing name -->
        <template v-else>
          <InputText
            v-model="editingName"
            class="rename-input"
            size="small"
            autofocus
            @keydown="onRenameKeydown"
            @blur="finishRename"
            @click.stop
          />
        </template>
      </div>

      <!-- Empty state -->
      <div v-if="threadStore.sortedThreadIds.length === 0" class="empty-state">
        <i class="pi pi-inbox" />
        <p>No threads yet</p>
      </div>
    </div>

    <!-- Bottom: Add thread (OneNote-style) -->
    <div class="panel-footer">
      <div v-if="showNewThreadInput" class="new-thread-input">
        <InputText
          v-model="newThreadName"
          placeholder="Thread name..."
          size="small"
          class="w-full"
          autofocus
          @keydown="onNewThreadKeydown"
        />
      </div>
      <button class="add-button" @click="showNewThreadInput = !showNewThreadInput">
        <i class="pi pi-plus" />
        <span>Add thread</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.threads-panel {
  width: 220px;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--surface-ground);
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

.panel-title {
  font-weight: 600;
  font-size: 14px;
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
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
}

.thread-item:hover {
  background: var(--surface-hover);
}

.thread-item.active {
  background: var(--highlight-bg);
  border-left-color: var(--primary-color);
}

.thread-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.thread-name span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.thread-actions {
  display: none;
  gap: 2px;
}

.thread-item:hover .thread-actions {
  display: flex;
}

.rename-input {
  width: 100%;
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

.new-thread-input {
  padding: 4px 8px 4px;
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
