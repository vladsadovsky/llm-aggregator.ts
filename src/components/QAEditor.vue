<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import type { QACreateData } from '../types/QAPair'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'

const emit = defineEmits<{
  created: [pairId: string]
  cancel: []
}>()

const qaStore = useQAStore()
const uiStore = useUIStore()

const sourceOptions = [
  { label: 'Claude', value: 'claude' },
  { label: 'ChatGPT', value: 'chatGPT' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Copilot', value: 'copilot' },
  { label: 'DeepSeek', value: 'deepseek' },
]

const title = ref('')
const source = ref('')
const url = ref('')
const tags = ref<string[]>([])
const tagSuggestions = ref<string[]>([])
const question = ref('')
const answer = ref('')
const urlError = ref('')
const previousAutoTitle = ref('')
const questionRef = ref<InstanceType<typeof Textarea> | null>(null)

// Auto-generate title from question
const autoTitle = computed(() => {
  if (!question.value.trim()) return ''
  const clean = question.value
    .replace(/[#*_~`]/g, '') // Remove markdown
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim()
  return clean.length > 70 
    ? clean.substring(0, 70) + '...' 
    : clean
})

// Watch question and update title if it's empty or matches previous auto-title
watch(question, () => {
  if (!title.value || title.value === previousAutoTitle.value) {
    title.value = autoTitle.value
    previousAutoTitle.value = autoTitle.value
  }
})

// Validate URL
watch(url, (newUrl) => {
  if (!newUrl.trim()) {
    urlError.value = ''
    return
  }
  try {
    new URL(newUrl)
    urlError.value = ''
  } catch {
    urlError.value = 'Invalid URL format'
  }
})

function searchTags(event: { query: string }) {
  const query = event.query.toLowerCase()
  tagSuggestions.value = qaStore.allTags
    .filter(t => t.includes(query) && !tags.value.includes(t))
}

// Pre-fill with last-used metadata
onMounted(async () => {
  if (uiStore.rememberLastMetadata) {
    const lastUsed = uiStore.getLastUsedMetadata()
    source.value = lastUsed.source
    tags.value = [...lastUsed.tags]
    url.value = lastUsed.url
  }

  // Focus the question textarea after DOM renders
  await nextTick()
  const el = (questionRef.value as any)?.$el
  if (el) {
    const textarea = el.tagName === 'TEXTAREA' ? el : el.querySelector('textarea')
    textarea?.focus()
  }
})

async function create() {
  if (!question.value.trim()) return
  if (urlError.value) return

  const tagArray = tags.value
    .map((t) => t.trim())
    .filter(Boolean)

  const data: QACreateData = {
    title: title.value.trim() || 'Untitled',
    source: source.value,
    url: url.value.trim(),
    tags: tagArray,
    question: question.value,
    answer: answer.value,
  }

  // Save last-used metadata
  uiStore.setLastUsedMetadata(source.value, tagArray, url.value.trim())

  const pair = await qaStore.createPair(data)
  emit('created', pair.id)
}

function handleKeydown(event: KeyboardEvent) {
  // Ctrl+Enter or Cmd+Enter to submit
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    create()
  }
  // Escape to cancel
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}
</script>

<template>
  <div class="qa-editor-overlay" @click.self="emit('cancel')">
    <div class="qa-editor" @keydown="handleKeydown">
      <h3 class="editor-title">New QA</h3>

      <div class="field">
        <label>Title</label>
        <InputText 
          v-model="title" 
          placeholder="Auto-generated from question..." 
          class="w-full" 
        />
        <small v-if="autoTitle && !title" class="field-hint">
          Will use: "{{ autoTitle }}"
        </small>
      </div>

      <div class="field-row">
        <div class="field flex-1">
          <label>Source</label>
          <Select
            v-model="source"
            :options="sourceOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select model"
            class="w-full"
          />
        </div>
        <div class="field flex-1">
          <label>URL</label>
          <InputText 
            v-model="url" 
            placeholder="https://..." 
            class="w-full"
            :class="{ 'p-invalid': urlError }"
          />
          <small v-if="urlError" class="field-error">{{ urlError }}</small>
        </div>
      </div>

      <div class="field">
        <label>Tags</label>
        <AutoComplete
          v-model="tags"
          :suggestions="tagSuggestions"
          @complete="searchTags"
          multiple
          placeholder="Type to add tags..."
          class="w-full"
        />
      </div>

      <div class="field">
        <label>Question</label>
        <Textarea
          ref="questionRef"
          v-model="question"
          rows="4"
          autoResize
          placeholder="Enter question..."
          class="w-full"
        />
      </div>

      <div class="field">
        <label>Answer</label>
        <Textarea
          v-model="answer"
          rows="8"
          autoResize
          placeholder="Enter answer..."
          class="w-full"
        />
      </div>

      <div class="button-row">
        <small class="shortcut-hint">Ctrl/Cmd+Enter to save, Esc to cancel</small>
        <div class="button-group">
          <Button label="Cancel" severity="secondary" outlined @click="emit('cancel')" />
          <Button 
            label="Create QA" 
            icon="pi pi-check" 
            @click="create"
            :disabled="!question.trim() || !!urlError"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qa-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.qa-editor {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.editor-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.field {
  margin-bottom: 12px;
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

.field-error {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--red-500);
}

.field-row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
}

.w-full {
  width: 100%;
}

.button-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.button-group {
  display: flex;
  gap: 8px;
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}
</style>
