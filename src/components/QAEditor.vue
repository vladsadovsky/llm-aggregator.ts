<script setup lang="ts">
import { ref } from 'vue'
import { useQAStore } from '../stores/qaStore'
import type { QACreateData } from '../types/QAPair'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'

const emit = defineEmits<{
  created: [pairId: string]
  cancel: []
}>()

const qaStore = useQAStore()

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
const tags = ref('')
const question = ref('')
const answer = ref('')

async function create() {
  if (!question.value.trim()) return

  const data: QACreateData = {
    title: title.value.trim() || 'Untitled',
    source: source.value,
    url: url.value.trim(),
    tags: tags.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    question: question.value,
    answer: answer.value,
  }

  const pair = await qaStore.createPair(data)
  emit('created', pair.id)
}
</script>

<template>
  <div class="qa-editor-overlay" @click.self="emit('cancel')">
    <div class="qa-editor">
      <h3 class="editor-title">New QA</h3>

      <div class="field">
        <label>Title</label>
        <InputText v-model="title" placeholder="QA title..." class="w-full" />
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
          <InputText v-model="url" placeholder="https://..." class="w-full" />
        </div>
      </div>

      <div class="field">
        <label>Tags (comma-separated)</label>
        <InputText v-model="tags" placeholder="tag1, tag2..." class="w-full" />
      </div>

      <div class="field">
        <label>Question</label>
        <Textarea
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
        <Button label="Cancel" severity="secondary" outlined @click="emit('cancel')" />
        <Button label="Create QA" icon="pi pi-check" @click="create" />
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
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
