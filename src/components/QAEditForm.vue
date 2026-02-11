<script setup lang="ts">
import { ref } from 'vue'
import { useQAStore } from '../stores/qaStore'
import type { QAPairData, QAUpdateData } from '../types/QAPair'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps<{
  pair: QAPairData
}>()

const emit = defineEmits<{
  saved: []
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

const title = ref(props.pair.title)
const source = ref(props.pair.source)
const url = ref(props.pair.url)
const tags = ref([...props.pair.tags])
const tagSuggestions = ref<string[]>([])
const question = ref(props.pair.question)
const answer = ref(props.pair.answer)

function searchTags(event: { query: string }) {
  const query = event.query.toLowerCase()
  tagSuggestions.value = qaStore.allTags
    .filter(t => t.includes(query) && !tags.value.includes(t))
}

async function save() {
  const data: QAUpdateData = {
    title: title.value.trim() || 'Untitled',
    source: source.value,
    url: url.value.trim(),
    tags: tags.value
      .map((t: string) => t.trim())
      .filter(Boolean),
    question: question.value,
    answer: answer.value,
  }

  await qaStore.updatePair(props.pair.id, data)
  emit('saved')
}
</script>

<template>
  <div class="edit-form">
    <h3 class="form-title">Edit QA</h3>

    <div class="field">
      <label>Title</label>
      <InputText v-model="title" class="w-full" />
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
        <InputText v-model="url" class="w-full" />
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
      <Textarea v-model="question" rows="6" autoResize class="w-full" />
    </div>

    <div class="field">
      <label>Answer</label>
      <Textarea v-model="answer" rows="12" autoResize class="w-full" />
    </div>

    <div class="button-row">
      <Button label="Cancel" severity="secondary" outlined @click="emit('cancel')" />
      <Button label="Save" icon="pi pi-check" @click="save" />
    </div>
  </div>
</template>

<style scoped>
.edit-form {
  padding: 4px 0;
}

.form-title {
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
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>
