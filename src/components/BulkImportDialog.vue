<script setup lang="ts">
/**
 * BulkImportDialog.vue
 * Preview → confirm → progress → summary for account-export ("bulk") import.
 *
 * Nothing is written until the user presses Import: the preview arrives from
 * the main process as counts only (bodies stay in main), and the selection is
 * sent back as a list of conversation ids.
 */
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Checkbox from 'primevue/checkbox'
import ProgressBar from 'primevue/progressbar'
import type {
  BulkImportPreviewSummary,
  BulkImportProgress,
  BulkImportCommitResult,
  BulkImportSelection,
} from '../global'

const props = defineProps<{
  visible: boolean
  preview: BulkImportPreviewSummary | null
  progress: BulkImportProgress | null
  result: BulkImportCommitResult | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  commit: [selection: BulkImportSelection]
  close: []
}>()

const selectedIds = ref<string[]>([])
const skipDuplicates = ref(true)

// Default to everything selected each time a fresh preview arrives.
watch(
  () => props.preview,
  (preview) => {
    selectedIds.value = preview ? preview.threads.map((t) => t.sourceId).filter(Boolean) : []
    skipDuplicates.value = true
  },
  { immediate: true },
)

const isRunning = computed(() => props.progress !== null)
const isDone = computed(() => props.result !== null)

const selectedPairCount = computed(() => {
  if (!props.preview) return 0
  const chosen = new Set(selectedIds.value)
  return props.preview.threads
    .filter((t) => chosen.has(t.sourceId))
    .reduce((sum, t) => sum + (skipDuplicates.value ? t.pairCount - t.duplicateCount : t.pairCount), 0)
})

const allSelected = computed(
  () => props.preview !== null && selectedIds.value.length === props.preview.threads.length,
)

function toggleAll() {
  if (!props.preview) return
  selectedIds.value = allSelected.value ? [] : props.preview.threads.map((t) => t.sourceId).filter(Boolean)
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return 'estimating…'
  if (seconds < 60) return `${seconds}s remaining`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s remaining`
}

const dateRangeLabel = computed(() => {
  if (!props.preview) return ''
  const { from, to } = props.preview.dateRange
  if (!from && !to) return 'unknown'
  return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`
})

function submit() {
  if (selectedIds.value.length === 0 || isRunning.value) return
  emit('commit', { threadSourceIds: [...selectedIds.value], skipDuplicates: skipDuplicates.value })
}

function close() {
  if (isRunning.value) return // never abandon an in-flight write
  emit('update:visible', false)
  emit('close')
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Import Account Export"
    :modal="true"
    :closable="!isRunning"
    :style="{ width: '760px', maxWidth: '94vw' }"
    data-testid="bulk-import-dialog"
    @update:visible="(v: boolean) => !isRunning && emit('update:visible', v)"
    @hide="close"
  >
    <!-- ── Summary phase ── -->
    <div v-if="isDone && result">
      <Message
        :severity="result.failed > 0 ? 'warn' : 'success'"
        :closable="false"
        class="dialog-message"
      >
        Imported <strong>{{ result.createdPairs }}</strong> Q&amp;A
        {{ result.createdPairs === 1 ? 'pair' : 'pairs' }} into
        <strong>{{ result.createdThreads }}</strong>
        {{ result.createdThreads === 1 ? 'thread' : 'threads' }}.
      </Message>

      <dl class="result-meta">
        <div><dt>Duplicates skipped</dt><dd>{{ result.skippedDuplicates }}</dd></div>
        <div><dt>Failed</dt><dd>{{ result.failed }}</dd></div>
      </dl>

      <div v-if="result.warnings.length > 0">
        <p class="section-label">
          Warnings
        </p>
        <ul class="warnings-list">
          <li
            v-for="(w, i) in result.warnings"
            :key="'rw-' + i"
          >
            {{ w }}
          </li>
        </ul>
      </div>
    </div>

    <!-- ── Progress phase ── -->
    <div v-else-if="isRunning && progress">
      <p class="progress-headline">
        Importing {{ progress.processed }} of {{ progress.total }} Q&amp;A pairs…
      </p>
      <ProgressBar :value="progress.percent" />
      <p class="progress-detail">
        <span class="progress-eta">{{ progress.percent }}% · {{ formatEta(progress.etaSeconds) }}</span>
        <span class="progress-thread">
          Thread {{ progress.threadsDone + 1 }} / {{ progress.threadsTotal }}:
          <strong>{{ progress.currentThreadName }}</strong>
        </span>
        <span class="progress-item">{{ progress.currentItemTitle }}</span>
      </p>
      <p class="progress-note">
        Please keep the app open until this finishes.
      </p>
    </div>

    <!-- ── Preview / selection phase ── -->
    <div v-else-if="preview">
      <dl class="result-meta">
        <div><dt>Format</dt><dd>{{ preview.formatLabel }}</dd></div>
        <div>
          <dt>Read from</dt><dd class="mono">
            {{ preview.sourceEntry }}
          </dd>
        </div>
        <div><dt>Conversations</dt><dd>{{ preview.threads.length }}</dd></div>
        <div><dt>Q&amp;A pairs</dt><dd>{{ preview.totalPairs }}</dd></div>
        <div><dt>Date range</dt><dd>{{ dateRangeLabel }}</dd></div>
      </dl>

      <Message
        v-for="(w, i) in preview.warnings"
        :key="'pw-' + i"
        severity="warn"
        :closable="false"
        class="dialog-message"
      >
        {{ w }}
      </Message>

      <Message
        v-if="preview.duplicatePairs > 0"
        severity="info"
        :closable="false"
        class="dialog-message"
      >
        <strong>{{ preview.duplicatePairs }}</strong> of these pairs are already in your archive
        (matched by import id).
      </Message>

      <div class="options-row">
        <Checkbox
          v-model="skipDuplicates"
          input-id="skip-duplicates"
          :binary="true"
        />
        <label for="skip-duplicates">Skip pairs already in the archive</label>
      </div>

      <div class="list-header">
        <Button
          :label="allSelected ? 'Deselect all' : 'Select all'"
          text
          size="small"
          @click="toggleAll"
        />
        <span class="list-count">{{ selectedIds.length }} of {{ preview.threads.length }} selected</span>
      </div>

      <ul class="thread-list">
        <li
          v-for="thread in preview.threads"
          :key="thread.sourceId"
          class="thread-row"
        >
          <Checkbox
            v-model="selectedIds"
            :value="thread.sourceId"
            :input-id="'t-' + thread.sourceId"
            :disabled="!thread.sourceId"
          />
          <label
            :for="'t-' + thread.sourceId"
            class="thread-label"
          >
            <span class="thread-name">{{ thread.name }}</span>
            <span class="thread-meta">
              {{ thread.pairCount }} {{ thread.pairCount === 1 ? 'pair' : 'pairs' }}
              <template v-if="thread.duplicateCount > 0">
                · {{ thread.duplicateCount }} already imported
              </template>
              <template v-if="thread.createdAt">· {{ formatDate(thread.createdAt) }}</template>
              <template v-if="thread.nameWasDerived"> · <em>name auto-derived</em></template>
            </span>
          </label>
        </li>
      </ul>
    </div>

    <template #footer>
      <template v-if="isDone">
        <Button
          label="Done"
          icon="pi pi-check"
          @click="close"
        />
      </template>
      <template v-else-if="isRunning">
        <Button
          label="Importing…"
          :loading="true"
          disabled
        />
      </template>
      <template v-else>
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          @click="close"
        />
        <Button
          :label="`Import ${selectedPairCount} Q&A${selectedPairCount === 1 ? '' : 's'}`"
          icon="pi pi-download"
          :disabled="selectedIds.length === 0"
          @click="submit"
        />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-message {
  margin: 10px 0;
}

.result-meta {
  margin: 4px 0 12px;
}

.result-meta > div {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--surface-border);
}

.result-meta dt {
  flex: 0 0 140px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.result-meta dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.options-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 13px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--surface-border);
  padding-top: 6px;
}

.list-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.thread-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}

.thread-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--surface-border);
}

.thread-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  min-width: 0;
}

.thread-name {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.thread-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.progress-headline {
  margin: 0 0 10px;
  font-size: 14px;
}

.progress-detail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.progress-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
}

.progress-note {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.section-label {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.warnings-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>
