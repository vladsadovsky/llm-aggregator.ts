<script setup lang="ts">
/**
 * ArchiveResetDialog.vue
 * Tools → Reset Archive: return the app to its "virgin" state.
 *
 * This is the most destructive action in the app, so it states exactly what will
 * go, exactly what stays, and requires the word DELETE to be typed — a plain
 * "Are you sure?" is too easy to click through.
 *
 * Nothing is actually deleted: main moves everything into a `purged-<stamp>`
 * folder and reports the path back, which is shown on completion.
 */
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import InputText from 'primevue/inputtext'
import type { ArchiveResetPreview, ArchiveResetResult } from '../global'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** Emitted once the reset succeeded, so the app can reload its stores. */
  reset: []
  close: []
}>()

const CONFIRM_WORD = 'DELETE'

const loading = ref(false)
const resetting = ref(false)
const preview = ref<ArchiveResetPreview | null>(null)
const result = ref<ArchiveResetResult | null>(null)
const confirmText = ref('')
const error = ref('')

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) void loadPreview()
  },
)

async function loadPreview() {
  loading.value = true
  error.value = ''
  result.value = null
  confirmText.value = ''
  preview.value = null
  try {
    preview.value = await window.api.archiveResetPreview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function runReset() {
  if (confirmText.value.trim().toUpperCase() !== CONFIRM_WORD) return
  resetting.value = true
  error.value = ''
  try {
    result.value = await window.api.archiveReset()
    emit('reset')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    resetting.value = false
  }
}

function close() {
  if (resetting.value) return
  emit('update:visible', false)
  emit('close')
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Reset Archive"
    :modal="true"
    :closable="!resetting"
    :style="{ width: '620px', maxWidth: '94vw' }"
    data-testid="archive-reset-dialog"
    @update:visible="(v: boolean) => !resetting && emit('update:visible', v)"
    @hide="close"
  >
    <div
      v-if="loading"
      class="busy-row"
    >
      <i class="pi pi-spin pi-spinner" />
      <span>Reading the archive…</span>
    </div>

    <template v-else>
      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="dialog-message"
      >
        {{ error }}
      </Message>

      <!-- Done -->
      <template v-if="result">
        <Message
          severity="success"
          :closable="false"
          class="dialog-message"
        >
          Archive reset. {{ result.pairsRemoved }} Q&amp;A
          {{ result.pairsRemoved === 1 ? 'pair' : 'pairs' }},
          {{ result.threadsRemoved }} {{ result.threadsRemoved === 1 ? 'thread' : 'threads' }} and
          {{ result.tagsRemoved }} {{ result.tagsRemoved === 1 ? 'tag' : 'tags' }} were cleared.
        </Message>
        <p class="intro">
          Nothing was deleted — everything was moved to:
        </p>
        <p class="backup-path">
          {{ result.backupPath }}
        </p>
        <Message
          v-for="warning in result.warnings"
          :key="warning"
          severity="warn"
          :closable="false"
          class="dialog-message"
        >
          {{ warning }}
        </Message>
      </template>

      <!-- Confirmation -->
      <template v-else-if="preview">
        <p class="intro">
          This returns the app to a clean, empty state. It will clear:
        </p>
        <ul class="what-list">
          <li><strong>{{ preview.pairs }}</strong> Q&amp;A {{ preview.pairs === 1 ? 'pair' : 'pairs' }}</li>
          <li><strong>{{ preview.threads }}</strong> {{ preview.threads === 1 ? 'thread' : 'threads' }}</li>
          <li><strong>{{ preview.tags }}</strong> tag dictionary {{ preview.tags === 1 ? 'entry' : 'entries' }}</li>
          <li v-if="preview.hasEmbeddings">All generated embeddings</li>
        </ul>
        <p class="intro">
          Your settings, data directory and API keys are kept. Everything cleared is
          <strong>moved aside</strong> into a <code>purged-…</code> folder inside
          <span class="backup-path">{{ preview.dataDirectory }}</span> — not deleted — so it can be
          recovered by hand.
        </p>

        <label
          for="archive-reset-confirm"
          class="confirm-label"
        >
          Type <strong>{{ CONFIRM_WORD }}</strong> to confirm:
        </label>
        <InputText
          id="archive-reset-confirm"
          v-model="confirmText"
          data-testid="archive-reset-confirm-input"
          class="confirm-input"
          autocomplete="off"
          :disabled="resetting"
          @keyup.enter="runReset"
        />
      </template>
    </template>

    <template #footer>
      <Button
        :label="result ? 'Close' : 'Cancel'"
        severity="secondary"
        outlined
        :disabled="resetting"
        @click="close"
      />
      <Button
        v-if="!result"
        label="Reset Archive"
        icon="pi pi-trash"
        severity="danger"
        data-testid="archive-reset-confirm-button"
        :disabled="confirmText.trim().toUpperCase() !== CONFIRM_WORD || resetting"
        :loading="resetting"
        @click="runReset"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.busy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.dialog-message {
  margin: 10px 0;
}

.intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
}

.what-list {
  margin: 0 0 12px;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
}

.backup-path {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  word-break: break-all;
  color: var(--text-color-secondary);
}

.confirm-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.confirm-input {
  width: 220px;
}
</style>
