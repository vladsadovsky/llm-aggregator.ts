<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQAStore } from '../stores/qaStore'
import { useTagStore } from '../stores/tagStore'
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
const tagStore = useTagStore()

const sourceOptions = [
  { label: 'Claude', value: 'claude' },
  { label: 'ChatGPT', value: 'chatGPT' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Copilot', value: 'copilot' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Lens', value: 'lens' },
]

const title = ref(props.pair.title)
const source = ref(props.pair.source)
const url = ref(props.pair.url)
const tags = ref([...props.pair.tags])
const tagSuggestions = ref<string[]>([])
const question = ref(props.pair.question)
const answer = ref(props.pair.answer)
const tagsAutoCompleteRef = ref<InstanceType<typeof AutoComplete> | null>(null)
const urlError = ref('')

watch(url, (newUrl: string) => {
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
}, { immediate: true })

// Tags not in dictionary (for warn mode display)
const newTagsInInput = computed(() =>
  tagStore.enforcementActive ? tagStore.filterNewTags(tags.value) : []
)

function searchTags(event: { query: string }) {
  const query = event.query.toLowerCase()
  const source = tagStore.enforcementActive ? tagStore.canonicalTags : qaStore.allTags
  tagSuggestions.value = source.filter((t: string) => t.includes(query) && !tags.value.includes(t))
}

function commitPendingTags() {
  const autoCompleteRoot = (tagsAutoCompleteRef.value as any)?.$el as HTMLElement | undefined
  if (!autoCompleteRoot) return

  const input = autoCompleteRoot.querySelector('input') as HTMLInputElement | null
  const raw = input?.value?.trim() || ''
  if (!raw) return

  const pendingTags = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (pendingTags.length === 0) return

  const existing = new Set(tags.value.map((t) => t.toLowerCase()))
  for (const tag of pendingTags) {
    const resolved = tagStore.resolveTag(tag) ?? tag.toLowerCase()

    if (tagStore.effectiveEnforcement === 'strict' && !tagStore.isKnownTag(tag)) {
      continue
    }

    if (!existing.has(resolved)) {
      tags.value.push(resolved)
      existing.add(resolved)
    }
  }

  if (input) {
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

async function save() {
  commitPendingTags()
  if (urlError.value) return

  const tagArray = tags.value.map((t: string) => t.trim()).filter(Boolean)

  // Auto-add new tags to dictionary in warn mode (only when below hard limit)
  if (tagStore.effectiveEnforcement === 'warn') {
    for (const tag of tagArray) {
      if (!tagStore.isKnownTag(tag)) {
        window.api.tagsAdd(tag).catch(() => {}) // best-effort, non-blocking
      }
    }
  }

  const data: QAUpdateData = {
    title: title.value.trim() || 'Untitled',
    source: source.value,
    url: url.value.trim(),
    tags: tagArray,
    question: question.value,
    answer: answer.value,
  }

  await qaStore.updatePair(props.pair.id, data)
  emit('saved')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const hotkeyIndex = Number(event.key)
    if (hotkeyIndex >= 1 && hotkeyIndex <= sourceOptions.length) {
      event.preventDefault()
      source.value = sourceOptions[hotkeyIndex - 1].value
      return
    }
  }

  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 's' || event.key === 'Enter')) {
    event.preventDefault()
    void save()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

function onGlobalSaveRequest() {
  void save()
}

function onGlobalCancelRequest() {
  emit('cancel')
}

onMounted(() => {
  if (!tagStore.loaded) tagStore.load() // fire-and-forget
  window.addEventListener('llm:save-current-edit', onGlobalSaveRequest)
  window.addEventListener('llm:cancel-current-edit', onGlobalCancelRequest)
})

onUnmounted(() => {
  window.removeEventListener('llm:save-current-edit', onGlobalSaveRequest)
  window.removeEventListener('llm:cancel-current-edit', onGlobalCancelRequest)
})
</script>

<template>
  <div
    class="edit-form"
    @keydown="handleKeydown"
  >
    <h3 class="form-title">
      Edit QA
    </h3>

    <div class="field">
      <label>Title</label>
      <InputText
        v-model="title"
        class="w-full"
        autofocus
      />
    </div>

    <div class="field-row">
      <div class="field flex-1">
        <label>Source</label>
        <Select
          v-model="source"
          :options="sourceOptions"
          option-label="label"
          option-value="value"
          placeholder="Select model"
          class="w-full"
        />
      </div>
      <div class="field flex-1">
        <label>URL</label>
        <InputText 
          v-model="url" 
          class="w-full" 
          :class="{ 'p-invalid': urlError }"
        />
        <small
          v-if="urlError"
          class="field-error"
        >{{ urlError }}</small>
      </div>
    </div>

    <div class="field">
      <label>Tags</label>
      <AutoComplete
        ref="tagsAutoCompleteRef"
        v-model="tags"
        :suggestions="tagSuggestions"
        multiple
        placeholder="Type to add tags..."
        class="w-full"
        @complete="searchTags"
      />
      <small
        v-if="tagStore.effectiveEnforcement === 'warn' && newTagsInInput.length > 0"
        class="field-hint tag-new-hint"
      >
        New tags (will be added to dictionary): {{ newTagsInInput.join(', ') }}
      </small>
      <small
        v-if="tagStore.atSoftLimit && tagStore.effectiveEnforcement === 'warn'"
        class="field-hint tag-new-hint"
      >
        Tag vocabulary is large ({{ tagStore.tagCount }} tags). Consider reusing existing tags.
      </small>
      <small
        v-if="tagStore.effectiveEnforcement === 'strict'"
        class="field-hint"
      >
        Only dictionary tags allowed.
      </small>
    </div>

    <div class="field">
      <label>Question</label>
      <Textarea
        v-model="question"
        rows="6"
        auto-resize
        class="w-full"
      />
    </div>

    <div class="field">
      <label>Answer</label>
      <Textarea
        v-model="answer"
        rows="12"
        auto-resize
        class="w-full"
      />
    </div>

    <div class="button-row">
      <small class="shortcut-hint">Ctrl/Cmd+S or Enter to save, Esc to cancel</small>
      <div class="button-group">
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          @click="emit('cancel')"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          :disabled="!!urlError"
          @click="save"
        />
      </div>
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

.field-error {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--red-500);
}

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.tag-new-hint {
  color: var(--orange-500);
}

.field-row {
  display: flex;
  gap: 12px;
}

.field-error {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--red-500);
}

.flex-1 {
  flex: 1;
}

.w-full {
  width: 100%;
}

.button-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.button-group {
  display: flex;
  gap: 8px;
}
</style>
