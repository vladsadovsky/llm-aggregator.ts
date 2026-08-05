<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useQAStore } from '../stores/qaStore'
import { useThreadStore } from '../stores/threadStore'
import { useUIStore } from '../stores/uiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Select from 'primevue/select'
import QAMetadataBar from './QAMetadataBar.vue'
import QAEditForm from './QAEditForm.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const qaStore = useQAStore()
const threadStore = useThreadStore()
const uiStore = useUIStore()
const confirm = useConfirm()
const toast = useToast()

const pair = computed(() => {
  if (!qaStore.selectedPairId) return null
  return qaStore.pairs[qaStore.selectedPairId] || null
})

const memberThreads = computed(() =>
  qaStore.selectedPairId ? threadStore.threadsContaining(qaStore.selectedPairId) : []
)

const availableThreads = computed(() =>
  qaStore.selectedPairId ? threadStore.threadsNotContaining(qaStore.selectedPairId) : []
)

const addThreadSelection = ref<string | null>(null)
const autoSuggestOnEdit = ref(false)

async function onAddToThread(event: { value: string }) {
  if (!qaStore.selectedPairId || !event.value) return
  await threadStore.addToThread(event.value, qaStore.selectedPairId)
  addThreadSelection.value = null
  toast.add({ severity: 'success', summary: 'Added to thread', life: 2000 })
}

async function removeFromMemberThread(tid: string) {
  if (!qaStore.selectedPairId) return
  await threadStore.removeFromThread(tid, qaStore.selectedPairId)

  if (tid === threadStore.selectedThreadId && !uiStore.showAllQAs && !uiStore.showUnthreaded) {
    qaStore.selectedPairId = null
    window.dispatchEvent(new Event('llm:focus-qa-list'))
  }

  toast.add({ severity: 'info', summary: 'Removed from thread', life: 2000 })
}

function startEdit() {
  autoSuggestOnEdit.value = false
  uiStore.isEditing = true
}

function startSuggestedEdit() {
  autoSuggestOnEdit.value = true
  uiStore.isEditing = true
}

function cancelEdit() {
  autoSuggestOnEdit.value = false
  uiStore.isEditing = false
  window.dispatchEvent(new Event('llm:focus-qa-list'))
}

async function onSaved() {
  autoSuggestOnEdit.value = false
  uiStore.isEditing = false
  window.dispatchEvent(new Event('llm:focus-qa-list'))
  toast.add({ severity: 'success', summary: 'QA saved', life: 2000 })
}

function confirmDelete() {
  if (!pair.value) return
  const id = qaStore.selectedPairId!
  const containingThreads = threadStore.threadsContaining(id)
  const threadNote =
    containingThreads.length > 1
      ? ` — referenced by ${containingThreads.length} threads: ${containingThreads.map((t) => t.name).join(', ')}. Deleting it removes it from every listed thread.`
      : ''
  confirm.require({
    message: `Delete QA "${pair.value.title}"? This cannot be undone.${threadNote}`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      const id = qaStore.selectedPairId!
      for (const thread of threadStore.threadsContaining(id)) {
        await threadStore.removeFromThread(thread.id, id)
      }
      await qaStore.deletePair(id)
      toast.add({ severity: 'info', summary: 'QA deleted', life: 2000 })
    },
  })
}

async function removeFromThread() {
  if (!qaStore.selectedPairId || !threadStore.selectedThreadId) return
  await threadStore.removeFromThread(threadStore.selectedThreadId, qaStore.selectedPairId)
  qaStore.selectedPairId = null
  window.dispatchEvent(new Event('llm:focus-qa-list'))
  toast.add({ severity: 'info', summary: 'Removed from thread', life: 2000 })
}

async function moveUp() {
  if (!qaStore.selectedPairId || !threadStore.selectedThreadId) return
  await threadStore.moveInThread(threadStore.selectedThreadId, qaStore.selectedPairId, -1)
}

async function moveDown() {
  if (!qaStore.selectedPairId || !threadStore.selectedThreadId) return
  await threadStore.moveInThread(threadStore.selectedThreadId, qaStore.selectedPairId, 1)
}

async function moveToStart() {
  if (!qaStore.selectedPairId || !threadStore.selectedThreadId) return
  await threadStore.moveToStartOfThread(threadStore.selectedThreadId, qaStore.selectedPairId)
}

async function moveToEnd() {
  if (!qaStore.selectedPairId || !threadStore.selectedThreadId) return
  await threadStore.moveToEndOfThread(threadStore.selectedThreadId, qaStore.selectedPairId)
}

const showMoveButtons = computed(() => {
  return threadStore.selectedThreadId && !uiStore.showAllQAs && !uiStore.showUnthreaded
})

const nextPairId = computed<string | null>(() => {
  if (!threadStore.selectedThreadId || !qaStore.selectedPairId) return null
  const items = threadStore.threads[threadStore.selectedThreadId]?.items ?? []
  const idx = items.indexOf(qaStore.selectedPairId)
  if (idx === -1) return null

  for (let i = idx + 1; i < items.length; i += 1) {
    if (items[i] in qaStore.pairs) return items[i]
  }
  return null
})

async function mergeWithNext() {
  const currentId = qaStore.selectedPairId
  const nextId = nextPairId.value
  if (!currentId || !nextId) return

  const current = qaStore.pairs[currentId]
  const next = qaStore.pairs[nextId]
  if (!current || !next) return

  const separator = '\n\n---\n\n'
  const mergedQuestion =
    current.question.trimEnd() +
    separator +
    `**${next.title}**\n\n` +
    next.question.trimStart()
  const mergedAnswer =
    current.answer.trimEnd() +
    separator +
    `**${next.title}**\n\n` +
    next.answer.trimStart()
  const mergedTags = [...new Set([...(current.tags ?? []), ...(next.tags ?? [])])]

  await qaStore.updatePair(currentId, {
    question: mergedQuestion,
    answer: mergedAnswer,
    tags: mergedTags,
  })

  for (const thread of threadStore.threadsContaining(nextId)) {
    await threadStore.removeFromThread(thread.id, nextId)
  }
  await qaStore.deletePair(nextId)

  toast.add({ severity: 'success', summary: 'Merged with next QA', life: 2000 })
}

function onEditSelectedQARequest() {
  if (!pair.value || uiStore.isEditing) return
  startEdit()
}

function onDeleteSelectedQARequest() {
  if (!pair.value || uiStore.isEditing) return
  confirmDelete()
}

function duplicateSelectedQA() {
  if (!pair.value || uiStore.isEditing) return

  uiStore.openQAEditorWithDraft(
    {
      title: `${pair.value.title} (copy)`,
      source: pair.value.source,
      url: pair.value.url,
      tags: [...pair.value.tags],
      question: pair.value.question,
      answer: pair.value.answer,
    },
    threadStore.selectedThreadId || null
  )
}

async function exportSelectedQA() {
  if (!pair.value) return
  const result = await window.api.exportQA(pair.value.id)
  if (result) {
    const filename = result.savedPath.split(/[/\\]/).pop() ?? result.savedPath
    toast.add({ severity: 'success', summary: 'QA exported', detail: `Saved to ${filename}`, life: 3000 })
  }
}

function onExportSelectedQARequest() {
  void exportSelectedQA()
}

onMounted(() => {
  window.addEventListener('llm:edit-selected-qa', onEditSelectedQARequest)
  window.addEventListener('llm:delete-selected-qa', onDeleteSelectedQARequest)
  window.addEventListener('llm:duplicate-selected-qa', duplicateSelectedQA)
  window.addEventListener('llm:export-selected-qa', onExportSelectedQARequest)
})

onUnmounted(() => {
  window.removeEventListener('llm:edit-selected-qa', onEditSelectedQARequest)
  window.removeEventListener('llm:delete-selected-qa', onDeleteSelectedQARequest)
  window.removeEventListener('llm:duplicate-selected-qa', duplicateSelectedQA)
  window.removeEventListener('llm:export-selected-qa', onExportSelectedQARequest)
})

const generatingMetadata = ref(false)

async function generateAIMetadata() {
  const id = qaStore.selectedPairId
  if (!id) return
  generatingMetadata.value = true
  try {
    const updated = await window.api.aiGenerateMetadata(id)
    if (updated) {
      qaStore.pairs[id] = updated
      toast.add({ severity: 'success', summary: 'Metadata generated', life: 2000 })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Metadata failed', detail: (err as Error).message, life: 5000 })
  } finally {
    generatingMetadata.value = false
  }
}
</script>

<template>
  <div
    class="qa-content-panel"
    :style="{ zoom: uiStore.contentZoom / 100 }"
  >
    <!-- Content when a QA is selected -->
    <template v-if="pair">
      <!-- Edit mode -->
      <template v-if="uiStore.isEditing">
        <QAEditForm
          :pair="pair"
          :auto-suggest="autoSuggestOnEdit"
          @saved="onSaved"
          @cancel="cancelEdit"
        />
      </template>

      <!-- View mode -->
      <template v-else>
        <!-- Metadata bar -->
        <QAMetadataBar :pair="pair" />

        <!-- Action buttons -->
        <div class="action-bar">
          <Button
            icon="pi pi-pencil"
            label="Edit"
            size="small"
            data-testid="edit-qa-button"
            outlined
            @click="startEdit"
          />
          <Button
            icon="pi pi-trash"
            label="Delete"
            size="small"
            data-testid="delete-qa-button"
            outlined
            severity="danger"
            @click="confirmDelete"
          />
          <Button
            icon="pi pi-copy"
            label="Duplicate"
            size="small"
            data-testid="duplicate-qa-button"
            outlined
            @click="duplicateSelectedQA"
          />
          <Button
            icon="pi pi-download"
            label="Export"
            size="small"
            data-testid="export-qa-button"
            outlined
            @click="exportSelectedQA"
          />
          <Button
            icon="pi pi-sparkles"
            label="Suggest title & tags"
            size="small"
            outlined
            title="Generate a reviewable title and tag draft for this Q&A"
            @click="startSuggestedEdit"
          />
          <Button
            icon="pi pi-sparkles"
            label="AI Metadata"
            size="small"
            outlined
            :loading="generatingMetadata"
            title="Generate AI metadata for this QA"
            @click="generateAIMetadata"
          />
          <div
            v-if="showMoveButtons"
            class="move-buttons"
          >
            <Button
              icon="pi pi-minus"
              label="Remove"
              size="small"
              outlined
              severity="warn"
              title="Remove from this thread (keeps the file)"
              @click="removeFromThread"
            />
            <Button
              icon="pi pi-angle-double-up"
              size="small"
              outlined
              title="Move to start of thread"
              @click="moveToStart"
            />
            <Button
              icon="pi pi-arrow-up"
              size="small"
              outlined
              title="Move up"
              @click="moveUp"
            />
            <Button
              icon="pi pi-arrow-down"
              size="small"
              outlined
              title="Move down"
              @click="moveDown"
            />
            <Button
              icon="pi pi-angle-double-down"
              size="small"
              outlined
              title="Move to end of thread"
              @click="moveToEnd"
            />
            <Button
              v-if="nextPairId"
              icon="pi pi-sitemap"
              size="small"
              data-testid="merge-next-qa-button"
              outlined
              severity="secondary"
              title="Merge with next QA in thread"
              @click="mergeWithNext"
            />
          </div>

          <div class="zoom-controls">
            <Button
              icon="pi pi-minus"
              size="small"
              text
              :disabled="uiStore.contentZoom <= 75"
              title="Zoom out"
              @click="uiStore.zoomOut()"
            />
            <span
              class="zoom-label"
              data-testid="zoom-label"
              title="Double-click to reset zoom"
              @dblclick="uiStore.zoomReset()"
            >{{ uiStore.contentZoom }}%</span>
            <Button
              icon="pi pi-plus"
              size="small"
              text
              :disabled="uiStore.contentZoom >= 300"
              title="Zoom in"
              @click="uiStore.zoomIn()"
            />
          </div>
        </div>

        <div class="thread-bar">
          <span class="thread-bar-label">Threads:</span>
          <span
            v-for="thread in memberThreads"
            :key="thread.id"
            class="thread-chip"
            :class="{ 'thread-chip--current': thread.id === threadStore.selectedThreadId }"
          >
            {{ thread.name }}
            <button
              class="thread-chip-remove"
              title="Remove from this thread"
              @click="removeFromMemberThread(thread.id)"
            >×</button>
          </span>
          <span
            v-if="memberThreads.length === 0"
            class="thread-bar-none"
          >not in any thread</span>
          <Select
            v-if="availableThreads.length > 0"
            v-model="addThreadSelection"
            data-testid="add-to-thread-select"
            :options="availableThreads"
            option-label="name"
            option-value="id"
            placeholder="+ Add to thread"
            class="thread-add-select"
            @change="onAddToThread"
          />
        </div>

        <!-- Question -->
        <div class="qa-section">
          <h3 class="section-label">
            Question
          </h3>
          <div class="section-content">
            <MarkdownRenderer :source="pair.question" />
          </div>
        </div>

        <!-- Answer -->
        <div class="qa-section">
          <h3 class="section-label">
            Answer
          </h3>
          <div class="section-content">
            <MarkdownRenderer :source="pair.answer" />
          </div>
        </div>
      </template>
    </template>

    <!-- Empty state -->
    <div
      v-else
      class="empty-state"
    >
      <i class="pi pi-book" />
      <h3>No QA Selected</h3>
      <p>Select a QA from the list to view its content</p>
    </div>
  </div>
</template>

<style scoped>
.qa-content-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px 24px;
  background: var(--surface-section);
  height: 100%;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.move-buttons {
  display: flex;
  gap: 4px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.zoom-label {
  font-size: 11px;
  min-width: 32px;
  text-align: center;
  color: var(--text-color-secondary);
  cursor: default;
  user-select: none;
}

.thread-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0 10px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.thread-bar-label {
  color: var(--text-color-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 2px;
}

.thread-bar-none {
  color: var(--text-color-secondary);
  font-style: italic;
}

.thread-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  border-radius: 12px;
  background: var(--surface-hover);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  font-size: 12px;
}

.thread-chip--current {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.thread-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  font-size: 14px;
  color: inherit;
  opacity: 0.5;
  display: flex;
  align-items: center;
}

.thread-chip-remove:hover {
  opacity: 1;
}

.thread-add-select {
  font-size: 12px;
}

.thread-add-select :deep(.p-select) {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.qa-section {
  margin-bottom: 24px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 2px solid var(--primary-color);
  display: inline-block;
}

.section-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-color-secondary);
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state h3 {
  margin-bottom: 8px;
  font-weight: 500;
}

.empty-state p {
  font-size: 13px;
}
</style>
