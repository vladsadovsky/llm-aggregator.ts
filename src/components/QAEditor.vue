<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useQAStore } from '../stores/qaStore'
import { useThreadStore } from '../stores/threadStore'
import { useUIStore } from '../stores/uiStore'
import type { QACreateData } from '../types/QAPair'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
import FocusTrap from 'primevue/focustrap'

const vFocustrap = FocusTrap

const props = defineProps<{
  initialData?: Partial<QACreateData> | null
  initialTargetThreadId?: string | null
}>()

const emit = defineEmits<{
  created: [pairId: string, targetThreadId: string | null, continueAdding: boolean]
  cancel: []
}>()

const qaStore = useQAStore()
const threadStore = useThreadStore()
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
const tagsAutoCompleteRef = ref<InstanceType<typeof AutoComplete> | null>(null)
const targetThreadId = ref('')
const newThreadName = ref('')
const pendingBatchEntries = ref<ParsedPaste[]>([])
const isCreatingBatch = ref(false)

const CREATE_THREAD_OPTION = '__create_new_thread__'
const META_LINE_MAX = 12

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

const threadOptions = computed(() => {
  const options = [{ label: 'None (unassigned)', value: '' }]
  for (const tid of threadStore.sortedThreadIds) {
    const thread = threadStore.threads[tid]
    if (thread) {
      options.push({ label: thread.name, value: tid })
    }
  }
  options.push({ label: '+ Create new thread…', value: CREATE_THREAD_OPTION })
  return options
})

const needsNewThreadName = computed(() => targetThreadId.value === CREATE_THREAD_OPTION)
const canCreate = computed(() => {
  if (!question.value.trim() || !!urlError.value) return false
  if (needsNewThreadName.value && !newThreadName.value.trim()) return false
  return true
})
const canCreateBatch = computed(() => canCreate.value && pendingBatchEntries.value.length > 0 && !isCreatingBatch.value)

// Watch question and update title if it's empty or matches previous auto-title
watch(question, () => {
  if (!title.value || title.value === previousAutoTitle.value) {
    title.value = autoTitle.value
    previousAutoTitle.value = autoTitle.value
  }
})

watch(targetThreadId, (newValue) => {
  if (newValue !== CREATE_THREAD_OPTION) {
    newThreadName.value = ''
  }
  pendingBatchEntries.value = []
})

// Validate URL
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
})

function searchTags(event: { query: string }) {
  const query = event.query.toLowerCase()
  tagSuggestions.value = qaStore.allTags
    .filter((t: string) => t.includes(query) && !tags.value.includes(t))
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
    const normalized = tag.toLowerCase()
    if (!existing.has(normalized)) {
      tags.value.push(tag)
      existing.add(normalized)
    }
  }

  if (input) {
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

type ParsedPaste = {
  title: string
  source: string
  url: string
  tags: string[]
  question: string
  answer: string
}

function parseStructuredPaste(text: string): ParsedPaste[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const sharedMeta: Omit<ParsedPaste, 'question' | 'answer'> = {
    title: '',
    source: '',
    url: '',
    tags: [],
  }

  const lines = normalized.split('\n')
  for (let i = 0; i < Math.min(lines.length, META_LINE_MAX); i += 1) {
    const line = lines[i].trim()
    const metaMatch = line.match(/^(title|source|url|tags)\s*:\s*(.+)$/i)
    if (!metaMatch) continue
    const key = metaMatch[1].toLowerCase()
    const value = metaMatch[2].trim()
    if (!value) continue
    if (key === 'title') sharedMeta.title = value
    if (key === 'source') sharedMeta.source = value
    if (key === 'url') sharedMeta.url = value
    if (key === 'tags') {
      sharedMeta.tags = value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    }
  }

  const parsedEntries: ParsedPaste[] = []

  const inlineRegex = /(?:^|\n)q(?:uestion)?\s*:\s*([\s\S]*?)\n+a(?:nswer)?\s*:\s*([\s\S]*?)(?=\nq(?:uestion)?\s*:|$)/gi
  for (const match of normalized.matchAll(inlineRegex)) {
    const q = match[1]?.trim() || ''
    const a = match[2]?.trim() || ''
    if (q && a) {
      parsedEntries.push({
        ...sharedMeta,
        question: q,
        answer: a,
      })
    }
  }

  if (parsedEntries.length === 0) {
    const mdRegex = /##?\s*question\s*\n([\s\S]*?)\n##?\s*answer\s*\n([\s\S]*?)(?=\n##?\s*question\s*\n|$)/gi
    for (const match of normalized.matchAll(mdRegex)) {
      const q = match[1]?.trim() || ''
      const a = match[2]?.trim() || ''
      if (q && a) {
        parsedEntries.push({
          ...sharedMeta,
          question: q,
          answer: a,
        })
      }
    }
  }

  return parsedEntries
}

function mergeTags(nextTags: string[]) {
  if (nextTags.length === 0) return
  const existing = new Set(tags.value.map((t) => t.toLowerCase()))
  for (const tag of nextTags) {
    const normalized = tag.toLowerCase()
    if (!existing.has(normalized)) {
      tags.value.push(tag)
      existing.add(normalized)
    }
  }
}

function handleStructuredPaste(event: ClipboardEvent) {
  const pastedText = event.clipboardData?.getData('text/plain') || ''
  if (!pastedText) return

  const parsed = parseStructuredPaste(pastedText)
  if (parsed.length === 0) return

  event.preventDefault()
  const first = parsed[0]
  question.value = first.question
  answer.value = first.answer

  if (first.title) {
    title.value = first.title
    previousAutoTitle.value = first.title
  }
  if (first.source) source.value = first.source
  if (first.url) url.value = first.url
  mergeTags(first.tags)

  pendingBatchEntries.value = parsed.slice(1)
}

// Pre-fill with last-used metadata
onMounted(async () => {
  if (props.initialData) {
    title.value = props.initialData.title || ''
    source.value = props.initialData.source || ''
    url.value = props.initialData.url || ''
    tags.value = [...(props.initialData.tags || [])]
    question.value = props.initialData.question || ''
    answer.value = props.initialData.answer || ''
  } else if (uiStore.rememberLastMetadata) {
    const lastUsed = uiStore.getLastUsedMetadata()
    source.value = lastUsed.source
    tags.value = [...lastUsed.tags]
    url.value = lastUsed.url
  }
  if (props.initialTargetThreadId && threadStore.threads[props.initialTargetThreadId]) {
    targetThreadId.value = props.initialTargetThreadId
  } else if (threadStore.selectedThreadId && threadStore.threads[threadStore.selectedThreadId]) {
    targetThreadId.value = threadStore.selectedThreadId
  } else if (uiStore.lastUsedThreadId && threadStore.threads[uiStore.lastUsedThreadId]) {
    targetThreadId.value = uiStore.lastUsedThreadId
  }

  // Focus the question textarea after DOM renders
  await nextTick()
  const el = (questionRef.value as any)?.$el
  if (el) {
    const textarea = el.tagName === 'TEXTAREA' ? el : el.querySelector('textarea')
    textarea?.focus()
  }
})

async function create(continueAdding = false) {
  commitPendingTags()

  if (!question.value.trim()) return
  if (urlError.value) return

  const tagArray = tags.value
    .map((t: string) => t.trim())
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

  let selectedTargetThreadId: string | null = targetThreadId.value || null
  if (targetThreadId.value === CREATE_THREAD_OPTION) {
    const createdThreadId = await threadStore.createThread(newThreadName.value.trim())
    selectedTargetThreadId = createdThreadId
  }

  if (selectedTargetThreadId) {
    uiStore.setLastUsedThreadId(selectedTargetThreadId)
  }

  emit('created', pair.id, selectedTargetThreadId, continueAdding)

  if (continueAdding) {
    if (pendingBatchEntries.value.length > 0) {
      const next = pendingBatchEntries.value.shift()!
      title.value = next.title || ''
      source.value = next.source || source.value
      url.value = next.url || ''
      tags.value = [...next.tags]
      question.value = next.question
      answer.value = next.answer
      previousAutoTitle.value = title.value
    } else {
      title.value = ''
      question.value = ''
      answer.value = ''
      previousAutoTitle.value = ''
    }

    if (targetThreadId.value === CREATE_THREAD_OPTION && selectedTargetThreadId) {
      targetThreadId.value = selectedTargetThreadId
    }
    newThreadName.value = ''

    await nextTick()
    const el = (questionRef.value as any)?.$el
    if (el) {
      const textarea = el.tagName === 'TEXTAREA' ? el : el.querySelector('textarea')
      textarea?.focus()
    }
  }
}

async function resolveTargetThreadForCreate(): Promise<string | null> {
  let selectedTargetThreadId: string | null = targetThreadId.value || null
  if (targetThreadId.value === CREATE_THREAD_OPTION) {
    const createdThreadId = await threadStore.createThread(newThreadName.value.trim())
    selectedTargetThreadId = createdThreadId
    targetThreadId.value = createdThreadId
  }
  return selectedTargetThreadId
}

async function createParsedBatch() {
  if (!canCreateBatch.value) return

  commitPendingTags()
  if (!question.value.trim() || urlError.value) return

  isCreatingBatch.value = true
  try {
    const selectedTargetThreadId = await resolveTargetThreadForCreate()

    const initialTags = tags.value
      .map((t) => t.trim())
      .filter(Boolean)

    const queue: QACreateData[] = [
      {
        title: title.value.trim() || 'Untitled',
        source: source.value,
        url: url.value.trim(),
        tags: initialTags,
        question: question.value,
        answer: answer.value,
      },
      ...pendingBatchEntries.value.map((entry) => ({
        title: entry.title.trim() || 'Untitled',
        source: entry.source,
        url: entry.url.trim(),
        tags: entry.tags.map((t) => t.trim()).filter(Boolean),
        question: entry.question,
        answer: entry.answer,
      })),
    ]

    let lastPairId = ''
    for (const data of queue) {
      const pair = await qaStore.createPair(data)
      lastPairId = pair.id
      if (selectedTargetThreadId) {
        await threadStore.addToThread(selectedTargetThreadId, pair.id)
      }
    }

    uiStore.setLastUsedMetadata(source.value, initialTags, url.value.trim())
    if (selectedTargetThreadId) {
      uiStore.setLastUsedThreadId(selectedTargetThreadId)
    }

    pendingBatchEntries.value = []
    emit('created', lastPairId, selectedTargetThreadId, false)
  } finally {
    isCreatingBatch.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    create(true)
    return
  }

  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const hotkeyIndex = Number(event.key)
    if (hotkeyIndex >= 1 && hotkeyIndex <= sourceOptions.length) {
      event.preventDefault()
      source.value = sourceOptions[hotkeyIndex - 1].value
      return
    }
  }

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
    <div class="qa-editor" v-focustrap @keydown="handleKeydown">
      <h3 class="editor-title">New QA</h3>

      <div class="field">
        <label>Title</label>
        <InputText 
          v-model="title" 
          placeholder="Auto-generated from question..." 
          class="w-full" 
          autofocus
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
          ref="tagsAutoCompleteRef"
          v-model="tags"
          :suggestions="tagSuggestions"
          @complete="searchTags"
          multiple
          placeholder="Type to add tags..."
          class="w-full"
        />
      </div>

      <div class="field">
        <label>Add to Thread</label>
        <Select
          v-model="targetThreadId"
          :options="threadOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Select thread"
          class="w-full"
        />
      </div>

      <div v-if="needsNewThreadName" class="field">
        <label>New Thread Name</label>
        <InputText
          v-model="newThreadName"
          placeholder="Enter new thread name..."
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
          @paste="handleStructuredPaste"
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

      <div v-if="pendingBatchEntries.length > 0" class="field-hint batch-hint">
        Detected {{ pendingBatchEntries.length + 1 }} QA entries in pasted text.
      </div>

      <div class="button-row">
        <small class="shortcut-hint">Ctrl/Cmd+Enter create, Ctrl/Cmd+Shift+Enter create & add another, Alt+1..5 source, Esc cancel</small>
        <div class="button-group">
          <Button label="Cancel" severity="secondary" outlined @click="emit('cancel')" />
          <Button
            v-if="pendingBatchEntries.length > 0"
            :label="`Create Parsed Batch (${pendingBatchEntries.length + 1})`"
            icon="pi pi-list-check"
            severity="secondary"
            outlined
            @click="() => createParsedBatch()"
            :disabled="!canCreateBatch"
          />
          <Button
            label="Create & Add Another"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            @click="() => create(true)"
            :disabled="!canCreate"
          />
          <Button 
            label="Create QA" 
            icon="pi pi-check" 
            @click="() => create()"
            :disabled="!canCreate"
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

.batch-hint {
  margin-top: 0;
  margin-bottom: 12px;
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
