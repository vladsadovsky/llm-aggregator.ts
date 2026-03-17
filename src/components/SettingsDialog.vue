<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Password from 'primevue/password'
import Select from 'primevue/select'
import AnnotationDialog from './AnnotationDialog.vue'
import HealthReportDialog from './HealthReportDialog.vue' 79db6aa (Phase 6 — Done)

const emit = defineEmits<{
  close: []
}>()

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const toast = useToast()

const dataDirectory = ref('')
const llmProvider = ref<'openai' | 'anthropic'>('openai')
const llmModel = ref('gpt-4o')
const openaiApiKey = ref('')
const anthropicApiKey = ref('')
const testingConnection = ref(false)
const generatingEmbeddings = ref(false)
const showAnnotationDialog = ref(false)
const showHealthDialog = ref(false) 79db6aa (Phase 6 — Done)
const embeddingsResult = ref<{ total: number; generated: number; skipped: number } | null>(null)

const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (coming soon)', value: 'anthropic' },
]

const modelOptionsByProvider: Record<string, { label: string; value: string }[]> = {
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
    { label: 'o3 mini', value: 'o3-mini' },
    { label: 'o4 mini', value: 'o4-mini' },
  ],
  anthropic: [
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  ],
}

const modelOptions = computed(() => modelOptionsByProvider[llmProvider.value] ?? [])

watch(llmProvider, (newProvider: string) => {
  const options = modelOptionsByProvider[newProvider] ?? []
  if (options.length > 0 && !options.find(o => o.value === llmModel.value)) {
    llmModel.value = options[0].value
  }
})
const rememberLastMetadataModel = computed({
  get: () => uiStore.rememberLastMetadata,
  set: (value: boolean) => uiStore.setRememberLastMetadata(Boolean(value)),
})

onMounted(async () => {
  const [settings, secrets] = await Promise.all([
    window.api.settingsLoad(),
    window.api.secretsLoad(),
  ])
  dataDirectory.value = settings.dataDirectory
  llmProvider.value = settings.llmProvider ?? 'openai'
  llmModel.value = settings.llmModel || (modelOptionsByProvider[llmProvider.value]?.[0]?.value ?? 'gpt-4o')
  openaiApiKey.value = secrets.openaiApiKey ?? ''
  anthropicApiKey.value = secrets.anthropicApiKey ?? ''
})

async function pickDirectory() {
  const dir = await window.api.settingsPickDirectory()
  if (dir) {
    dataDirectory.value = dir
  }
}

async function save() {
  await Promise.all([
    window.api.settingsSave({ dataDirectory: dataDirectory.value, llmProvider: llmProvider.value, llmModel: llmModel.value }),
    window.api.secretsSave({ openaiApiKey: openaiApiKey.value, anthropicApiKey: anthropicApiKey.value }),
  ])
  // Reload data from the new directory
  await threadStore.loadThreads()
  await qaStore.loadAllPairs()
  toast.add({ severity: 'success', summary: 'Settings saved', life: 3000 })
  emit('close')
}

function clearRememberedMetadata() {
  uiStore.clearLastUsedMetadata()
  toast.add({ severity: 'info', summary: 'Remembered metadata cleared', life: 2000 })
}

async function generateEmbeddings() {
  generatingEmbeddings.value = true
  embeddingsResult.value = null
  await window.api.secretsSave({ openaiApiKey: openaiApiKey.value, anthropicApiKey: anthropicApiKey.value })
  try {
    const result = await window.api.aiGenerateAllEmbeddings()
    embeddingsResult.value = result
    toast.add({
      severity: 'success',
      summary: 'Embeddings updated',
      detail: `${result.generated} generated, ${result.skipped} up to date (${result.total} total)`,
      life: 5000,
    })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Embedding failed', detail: (err as Error).message, life: 6000 })
  } finally {
    generatingEmbeddings.value = false
  }
}

async function testConnection() {
  testingConnection.value = true
  // Save secrets first so the main process has the latest key
  await window.api.secretsSave({ openaiApiKey: openaiApiKey.value, anthropicApiKey: anthropicApiKey.value })
  const result = await window.api.aiTestConnection()
  testingConnection.value = false
  if (result.ok) {
    toast.add({ severity: 'success', summary: 'Connection OK', detail: 'API key is valid', life: 3000 })
  } else {
    toast.add({ severity: 'error', summary: 'Connection failed', detail: result.error, life: 6000 })
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void save()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-dialog" @keydown="handleKeydown">
      <h3 class="dialog-title">
        <i class="pi pi-cog" />
        Settings
      </h3>

      <div class="field">
        <label>Data Directory</label>
        <p class="field-help">
          The folder containing your <code>archive/</code> subfolder and <code>threads.json</code>.
          Defaults to the current working directory.
        </p>
        <div class="dir-row">
          <InputText
            v-model="dataDirectory"
            class="dir-input"
            placeholder="/path/to/your/data"
          />
          <Button
            icon="pi pi-folder-open"
            outlined
            @click="pickDirectory"
            title="Browse..."
          />
        </div>
      </div>

      <div class="field">
        <label>Appearance</label>
        <div class="checkbox-field">
          <Checkbox 
            v-model="uiStore.darkMode" 
            inputId="darkMode" 
            binary 
            @change="uiStore.toggleDarkMode()"
          />
          <label for="darkMode" class="checkbox-label">Dark mode</label>
        </div>
      </div>

      <div class="field">
        <label>QA Editor</label>
        <div class="checkbox-field">
          <Checkbox 
            v-model="rememberLastMetadataModel" 
            inputId="rememberMetadata" 
            binary 
          />
          <label for="rememberMetadata" class="checkbox-label">
            Remember last-used source, tags, and URL
          </label>
        </div>
        <div class="metadata-actions">
          <Button
            label="Clear Remembered Metadata"
            severity="secondary"
            outlined
            size="small"
            @click="clearRememberedMetadata"
          />
        </div>
      </div>

      <div class="field">
        <label>AI / LLM</label>
        <p class="field-help">
          Used for metadata generation, embeddings, and future analysis features.
          API keys are stored locally in <code>secrets.json</code> and never committed to git.
        </p>
        <div class="ai-row">
          <Select
            v-model="llmProvider"
            :options="providerOptions"
            option-label="label"
            option-value="value"
            class="provider-select"
          />
          <Select
            v-model="llmModel"
            :options="modelOptions"
            option-label="label"
            option-value="value"
            class="model-select"
          />
        </div>
        <div class="ai-row" style="margin-top: 8px;">
          <Password
            v-if="llmProvider === 'openai'"
            v-model="openaiApiKey"
            placeholder="OpenAI API key (sk-...)"
            :feedback="false"
            toggle-mask
            class="api-key-input"
            input-class="api-key-input-inner"
          />
          <Password
            v-else
            v-model="anthropicApiKey"
            placeholder="Anthropic API key"
            :feedback="false"
            toggle-mask
            class="api-key-input"
            input-class="api-key-input-inner"
          />
          <Button
            label="Test"
            severity="secondary"
            outlined
            size="small"
            :loading="testingConnection"
            @click="testConnection"
          />
        </div>
        <div class="ai-row" style="margin-top: 8px;">
          <Button
            label="Generate all embeddings"
            icon="pi pi-database"
            severity="secondary"
            outlined
            size="small"
            :loading="generatingEmbeddings"
            @click="generateEmbeddings"
          />
          <span v-if="embeddingsResult" class="embeddings-status">
            {{ embeddingsResult.generated }} new, {{ embeddingsResult.skipped }} up to date
          </span>
        </div>
        <div class="ai-row" style="margin-top: 8px;">
          <Button
            label="Confidence Annotation Pass…"
            icon="pi pi-check-circle"
            severity="secondary"
            outlined
            size="small"
            @click="showAnnotationDialog = true"
          />
        </div>
        <div class="ai-row" style="margin-top: 8px;">
          <Button
            label="Archive Health Check…"
            icon="pi pi-heart"
            severity="secondary"
            outlined
            size="small"
            @click="showHealthDialog = true"
          />
        </div>
      </div>

      <AnnotationDialog v-if="showAnnotationDialog" @close="showAnnotationDialog = false" />
      <HealthReportDialog v-if="showHealthDialog" @close="showHealthDialog = false" /> 79db6aa (Phase 6 — Done)

      <div class="button-row">
        <Button label="Cancel" severity="secondary" outlined @click="emit('close')" />
        <Button label="Save" icon="pi pi-check" @click="save" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-dialog {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  width: 560px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}

.field-help {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
}

.field-help code {
  background: var(--surface-200);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.dir-row {
  display: flex;
  gap: 8px;
}

.dir-input {
  flex: 1;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.checkbox-label {
  font-size: 13px;
  color: var(--text-color);
  cursor: pointer;
  margin: 0;
}

.metadata-actions {
  margin-top: 8px;
}

.ai-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.provider-select {
  width: 180px;
}

.model-select {
  width: 200px;
}

.api-key-input {
  flex: 1;
}

:deep(.api-key-input-inner) {
  width: 100%;
}

.embeddings-status {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.button-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>
