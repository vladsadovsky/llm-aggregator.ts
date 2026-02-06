<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQAStore } from '../stores/qaStore'
import { useThreadStore } from '../stores/threadStore'
import { useUIStore } from '../stores/uiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
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

function startEdit() {
  uiStore.isEditing = true
}

function cancelEdit() {
  uiStore.isEditing = false
}

async function onSaved() {
  uiStore.isEditing = false
  toast.add({ severity: 'success', summary: 'QA saved', life: 2000 })
}

function confirmDelete() {
  if (!pair.value) return
  confirm.require({
    message: `Delete QA "${pair.value.title}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      const id = qaStore.selectedPairId!
      // Also remove from current thread
      if (threadStore.selectedThreadId) {
        await threadStore.removeFromThread(threadStore.selectedThreadId, id)
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

const showMoveButtons = computed(() => {
  return threadStore.selectedThreadId && !uiStore.showAllQAs
})
</script>

<template>
  <div class="qa-content-panel">
    <!-- Content when a QA is selected -->
    <template v-if="pair">
      <!-- Edit mode -->
      <template v-if="uiStore.isEditing">
        <QAEditForm :pair="pair" @saved="onSaved" @cancel="cancelEdit" />
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
            outlined
            @click="startEdit"
          />
          <Button
            icon="pi pi-trash"
            label="Delete"
            size="small"
            outlined
            severity="danger"
            @click="confirmDelete"
          />
          <Button
            v-if="showMoveButtons"
            icon="pi pi-minus"
            label="Remove"
            size="small"
            outlined
            severity="warn"
            title="Remove from this thread (keeps the file)"
            @click="removeFromThread"
          />
          <div v-if="showMoveButtons" class="move-buttons">
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
          </div>
        </div>

        <!-- Question -->
        <div class="qa-section">
          <h3 class="section-label">Question</h3>
          <div class="section-content">
            <MarkdownRenderer :source="pair.question" />
          </div>
        </div>

        <!-- Answer -->
        <div class="qa-section">
          <h3 class="section-label">Answer</h3>
          <div class="section-content">
            <MarkdownRenderer :source="pair.answer" />
          </div>
        </div>
      </template>
    </template>

    <!-- Empty state -->
    <div v-else class="empty-state">
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
  margin-left: auto;
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
