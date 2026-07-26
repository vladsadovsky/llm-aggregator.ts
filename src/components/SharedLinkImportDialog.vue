<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import type { SharedImportResult } from '../global'

const props = defineProps<{
  visible: boolean
  busy: boolean
  result: SharedImportResult | null
  error: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [url: string]
  close: []
}>()

const url = ref('')

// Reset the input each time the dialog is freshly opened.
watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && !props.result) url.value = ''
  },
)

const canSubmit = computed(() => url.value.trim().length > 0 && !props.busy)

// Flatten per-item warnings into a labeled list for the summary.
const itemWarnings = computed(() => {
  if (!props.result) return []
  const out: string[] = []
  props.result.items.forEach((item, idx) => {
    for (const w of item.warnings) {
      out.push(`QA ${idx + 1} (“${item.data.title}”): ${w}`)
    }
  })
  return out
})

const providerHint = 'chatgpt.com/share/…, share.gemini.google/…, or copilot.microsoft.com/shares/…'

function submit() {
  if (!canSubmit.value) return
  emit('submit', url.value.trim())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !props.result) {
    event.preventDefault()
    submit()
  }
}

function close() {
  emit('update:visible', false)
  emit('close')
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Import from Shared Link"
    :modal="true"
    :closable="!busy"
    :style="{ width: '600px', maxWidth: '92vw' }"
    data-testid="shared-link-import-dialog"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    @hide="close"
  >
    <!-- Input phase -->
    <div v-if="!result">
      <p class="dialog-intro">
        Paste a shared conversation link from ChatGPT, Gemini, or Copilot. The whole thread is
        split into Q&amp;A pairs and grouped into a new thread.
      </p>
      <div class="field">
        <label for="shared-link-url">Share link</label>
        <InputText
          id="shared-link-url"
          v-model="url"
          :disabled="busy"
          placeholder="https://…"
          class="w-full"
          autofocus
          @keydown="onKeydown"
        />
        <small class="field-hint">Supported: {{ providerHint }}</small>
      </div>

      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="dialog-message"
      >
        <span class="preserve-lines">{{ error }}</span>
      </Message>

      <div
        v-if="busy"
        class="busy-row"
      >
        <i class="pi pi-spin pi-spinner" />
        <span>Fetching and parsing the conversation… (Gemini links may take a few seconds to render)</span>
      </div>
    </div>

    <!-- Result phase -->
    <div
      v-else
      class="result-body"
    >
      <Message
        severity="success"
        :closable="false"
        class="dialog-message"
      >
        Imported {{ result.items.length }}
        Q&amp;A {{ result.items.length === 1 ? 'pair' : 'pairs' }} from {{ result.model }}.
      </Message>

      <dl class="result-meta">
        <div><dt>Thread</dt><dd>{{ result.threadName }}</dd></div>
        <div><dt>Model / source</dt><dd>{{ result.model }}</dd></div>
        <div>
          <dt>Tags</dt>
          <dd>
            <span
              v-for="tag in result.tags"
              :key="tag"
              class="tag-chip"
            >{{ tag }}</span>
          </dd>
        </div>
      </dl>

      <Message
        v-if="result.titleWasDerived"
        severity="warn"
        :closable="false"
        class="dialog-message"
      >
        No conversation title was found, so the thread was auto-named
        <strong>“{{ result.threadName }}”</strong>. Please rename it to something meaningful.
      </Message>

      <div v-if="result.warnings.length > 0">
        <p class="dialog-section-label">
          Warnings
        </p>
        <ul class="warnings-list">
          <li
            v-for="(w, i) in result.warnings"
            :key="'w-' + i"
          >
            {{ w }}
          </li>
        </ul>
      </div>

      <div v-if="itemWarnings.length > 0">
        <p class="dialog-section-label">
          Per-item notes
        </p>
        <ul class="warnings-list">
          <li
            v-for="(w, i) in itemWarnings"
            :key="'iw-' + i"
          >
            {{ w }}
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <template v-if="!result">
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          :disabled="busy"
          @click="close"
        />
        <Button
          label="Import"
          icon="pi pi-download"
          :disabled="!canSubmit"
          :loading="busy"
          @click="submit"
        />
      </template>
      <Button
        v-else
        label="Done"
        icon="pi pi-check"
        @click="close"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-intro {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  font-style: italic;
}

.w-full {
  width: 100%;
}

.dialog-message {
  margin: 12px 0;
}

.preserve-lines {
  white-space: pre-line;
}

.busy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.result-meta {
  margin: 4px 0 8px;
}

.result-meta > div {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--surface-border);
}

.result-meta dt {
  flex: 0 0 120px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.result-meta dd {
  margin: 0;
  font-size: 13px;
}

.tag-chip {
  display: inline-block;
  background: var(--surface-hover);
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 1px 8px;
  margin: 0 4px 4px 0;
  font-size: 11px;
}

.dialog-section-label {
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

.warnings-list li {
  margin-bottom: 3px;
}
</style>
