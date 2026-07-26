<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Password from 'primevue/password'
import Select from 'primevue/select'
import { useTagStore } from '../stores/tagStore'
import type { AppSecrets, SecretKey, SecretsStatus, SecretSource } from '../global'

interface ProviderDescriptor {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'openai-compatible'
  enabled: boolean
  comingSoon?: boolean
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey'
  supportsModelDiscovery: boolean
  notes?: string
}

interface ModelDescriptor {
  id: string
  label: string
  providerId: string
  qualityTier: 'budget' | 'balanced' | 'premium' | 'unknown'
  costTier: 'budget' | 'balanced' | 'premium' | 'unknown'
  latencyTier: 'fast' | 'medium' | 'slow' | 'unknown'
  recommendedFor: string[]
  notes?: string
  rank?: number
}

const emit = defineEmits<{
  close: []
  saved: [lensEnabled: boolean]
}>()

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const tagStore = useTagStore()
const toast = useToast()

const dataDirectory = ref('')
const llmProvider = ref('openai')
const llmModel = ref('gpt-4o')

/**
 * Key values are write-only: the main process never sends them here. These hold
 * only what the user types. An empty draft means "untouched" — that key is
 * omitted from the save so the stored value survives.
 */
const keyDrafts = ref<Record<SecretKey, string>>({ openaiApiKey: '', anthropicApiKey: '' })
const secretsStatus = ref<SecretsStatus | null>(null)
const devEnvVarNames = ref<string[]>([])
const recheckingStorage = ref(false)

const testingConnection = ref(false)
const loadingModelCatalog = ref(false)
const modelCatalogWarning = ref('')
const isDevMode = import.meta.env.DEV
const activeTab = ref<'general' | 'ai' | 'metadata'>('general')

const tagEnforcement = ref<'off' | 'warn' | 'strict'>('warn')
const tagSoftLimit = ref(50)
const tagHardLimit = ref(100)
const allowDevEnvSecrets = ref(false)
const lensEnabled = ref(false)

const enforcementOptions = [
  { label: 'Off — free-form tags', value: 'off' },
  { label: 'Warn — flag new tags', value: 'warn' },
  { label: 'Strict — dictionary only', value: 'strict' },
]

const providers = ref<ProviderDescriptor[]>([])
const modelsByProvider = ref<Record<string, ModelDescriptor[]>>({})

const providerOptions = computed(() => providers.value.map(provider => ({
  label: provider.comingSoon ? `${provider.label} (coming soon)` : provider.label,
  value: provider.id,
  disabled: !provider.enabled,
})))

const modelOptions = computed(() => {
  const models = modelsByProvider.value[llmProvider.value] ?? []
  return models.map(model => ({ label: model.label, value: model.id }))
})

const selectedProvider = computed(() => providers.value.find(provider => provider.id === llmProvider.value) ?? null)
const selectedModel = computed(() => {
  const models = modelsByProvider.value[llmProvider.value] ?? []
  return models.find(model => model.id === llmModel.value) ?? null
})

const providerKeyLabel = computed(() => {
  if (llmProvider.value === 'openai') {
    return 'OpenAI API key'
  }
  if (llmProvider.value === 'anthropic') {
    return 'Anthropic API key'
  }
  return 'API key'
})

/** Which stored secret the currently selected provider uses. */
const currentSecretKey = computed<SecretKey>(
  () => selectedProvider.value?.apiKeyField ?? 'openaiApiKey',
)

const currentKeyStatus = computed(
  () => secretsStatus.value?.keys[currentSecretKey.value] ?? null,
)

/** Draft text for the selected provider's key; empty means the field is untouched. */
const currentKeyDraft = computed({
  get: () => keyDrafts.value[currentSecretKey.value],
  set: (value: string) => {
    keyDrafts.value = { ...keyDrafts.value, [currentSecretKey.value]: value }
  },
})

const SOURCE_LABELS: Record<SecretSource, string> = {
  'env': 'development environment variable',
  'safe-storage': 'encrypted local storage',
  'none': 'not configured',
}

const currentKeyPlaceholder = computed(() => {
  const status = currentKeyStatus.value
  if (status?.readOnly) {
    return `Supplied by ${SOURCE_LABELS.env} — not editable here`
  }
  if (status?.hasKey) {
    return `Stored (${status.maskedPreview}) — type to replace`
  }
  return providerKeyLabel.value
})

/** Human-readable provenance line shown under the key field. */
const currentKeySourceText = computed(() => {
  const status = currentKeyStatus.value
  if (!status || !status.hasKey) {
    return 'No key stored for this provider.'
  }
  return `Key source: ${SOURCE_LABELS[status.source]} (${status.maskedPreview}).`
})

const secureStorageUnavailable = computed(() =>
  secretsStatus.value?.backends.some(b => b.id === 'safe-storage' && !b.available) ?? false,
)

const storageWarnings = computed(() =>
  (secretsStatus.value?.warnings ?? []).filter(warning =>
    warning.code !== 'LEGACY_FILE_ORPHANED' && warning.code !== 'NO_SECRET_AVAILABLE',
  ),
)

/**
 * Only the keys the user actually typed into. Untouched fields are omitted so the
 * main process leaves their stored values alone.
 */
function pendingSecretUpdates(): Partial<AppSecrets> {
  const updates: Partial<AppSecrets> = {}
  for (const key of Object.keys(keyDrafts.value) as SecretKey[]) {
    const draft = keyDrafts.value[key].trim()
    if (draft) {
      updates[key] = draft
    }
  }
  return updates
}

/** Persists any typed keys and refreshes status. Safe to call when nothing changed. */
async function flushSecretUpdates(): Promise<boolean> {
  const updates = pendingSecretUpdates()
  if (Object.keys(updates).length === 0) {
    return true
  }
  try {
    secretsStatus.value = await window.api.secretsSave(updates)
    // Clear drafts once stored: the field falls back to showing the masked value.
    keyDrafts.value = { openaiApiKey: '', anthropicApiKey: '' }
    return true
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'API key not saved',
      detail: (err as Error).message,
      life: 8000,
    })
    return false
  }
}

async function recheckStorage() {
  recheckingStorage.value = true
  try {
    secretsStatus.value = await window.api.secretsRecheck()
    toast.add({
      severity: secureStorageUnavailable.value ? 'warn' : 'success',
      summary: secureStorageUnavailable.value ? 'Secure storage still unavailable' : 'Secure storage available',
      life: 4000,
    })
  } finally {
    recheckingStorage.value = false
  }
}

const modelHints = computed(() => {
  if (!selectedModel.value) {
    return [] as string[]
  }
  const hints: string[] = []
  hints.push(`Quality: ${selectedModel.value.qualityTier}`)
  hints.push(`Cost: ${selectedModel.value.costTier}`)
  hints.push(`Latency: ${selectedModel.value.latencyTier}`)
  if (selectedModel.value.recommendedFor.length > 0) {
    hints.push(`Use for: ${selectedModel.value.recommendedFor.join(', ')}`)
  }
  return hints
})

async function loadModelCatalog(forceRefresh = false) {
  loadingModelCatalog.value = true
  modelCatalogWarning.value = ''
  try {
    // Only pass a key the user has just typed and not yet saved; otherwise the
    // main process resolves the stored key itself.
    const override = currentKeyDraft.value.trim() || undefined
    const result = await window.api.aiListModels(llmProvider.value, forceRefresh, override)
    modelsByProvider.value = {
      ...modelsByProvider.value,
      [llmProvider.value]: result.models,
    }
    if (result.warning) {
      modelCatalogWarning.value = result.warning
    }
    if (!result.models.find(model => model.id === llmModel.value) && result.models[0]) {
      llmModel.value = result.models[0].id
    }
  } catch (err) {
    modelCatalogWarning.value = (err as Error).message
    toast.add({ severity: 'warn', summary: 'Model list unavailable', detail: modelCatalogWarning.value, life: 5000 })
  } finally {
    loadingModelCatalog.value = false
  }
}

watch(llmProvider, (newProvider: string) => {
  const options = modelsByProvider.value[newProvider] ?? []
  if (options.length > 0 && !options.find(o => o.id === llmModel.value)) {
    llmModel.value = options[0].id
  }
  if (!modelsByProvider.value[newProvider]) {
    void loadModelCatalog(false)
  }
})
const rememberLastMetadataModel = computed({
  get: () => uiStore.rememberLastMetadata,
  set: (value: boolean) => uiStore.setRememberLastMetadata(Boolean(value)),
})

// Route the checkbox through the store's setter so the value is applied exactly
// once. Binding v-model straight to the store ref *and* calling toggle on change
// would mutate the state twice and cancel itself out.
const darkModeModel = computed({
  get: () => uiStore.darkMode,
  set: (value: boolean) => uiStore.setDarkMode(value),
})

/** Non-empty when the tag limits are invalid; also shown inline in the form. */
const tagLimitError = computed(() => {
  if (tagEnforcement.value === 'off') return ''
  const soft = tagSoftLimit.value
  const hard = tagHardLimit.value
  if (!Number.isInteger(soft) || soft < 1 || soft > 999) {
    return 'Soft limit must be a whole number between 1 and 999.'
  }
  if (!Number.isInteger(hard) || hard < 1 || hard > 999) {
    return 'Hard limit must be a whole number between 1 and 999.'
  }
  if (soft > hard) {
    return 'Soft limit cannot exceed the hard limit.'
  }
  return ''
})

onMounted(async () => {
  const [settings, status, discoveredProviders, envVarNames] = await Promise.all([
    window.api.settingsLoad(),
    window.api.secretsLoad(),
    window.api.aiListProviders(),
    window.api.secretsDevEnvVarNames(),
  ])
  secretsStatus.value = status
  devEnvVarNames.value = envVarNames
  providers.value = discoveredProviders
  const hasSavedProvider = discoveredProviders.some(provider => provider.id === settings.llmProvider && provider.enabled)
  dataDirectory.value = settings.dataDirectory
  llmProvider.value = hasSavedProvider ? settings.llmProvider : 'openai'
  llmModel.value = settings.llmModel || 'gpt-4o'
  tagEnforcement.value = settings.tagEnforcement ?? 'warn'
  tagSoftLimit.value = settings.tagSoftLimit ?? 50
  tagHardLimit.value = settings.tagHardLimit ?? 100
  allowDevEnvSecrets.value = settings.allowDevEnvSecrets ?? false
  lensEnabled.value = settings.lensEnabled === true
  await loadModelCatalog(false)
})

async function pickDirectory() {
  const dir = await window.api.settingsPickDirectory()
  if (dir) {
    dataDirectory.value = dir
  }
}

async function save() {
  if (tagLimitError.value) {
    activeTab.value = 'metadata'
    toast.add({ severity: 'warn', summary: 'Invalid tag limits', detail: tagLimitError.value, life: 5000 })
    return
  }

  await window.api.settingsSave({
    dataDirectory: dataDirectory.value,
    llmProvider: llmProvider.value,
    llmModel: llmModel.value,
    lensEnabled: lensEnabled.value,
    tagEnforcement: tagEnforcement.value,
    tagSoftLimit: tagSoftLimit.value,
    tagHardLimit: tagHardLimit.value,
    allowDevEnvSecrets: allowDevEnvSecrets.value,
  })

  // Settings are now persisted and the main process has rebuilt its menu, so
  // sync the renderer's Lens state immediately — before the independent secrets
  // save below, which may fail and keep the dialog open.
  emit('saved', lensEnabled.value)

  // Keys are saved separately and can fail independently (secure storage may be
  // unavailable). Keep the dialog open in that case so the typed key is not lost.
  const secretsSaved = await flushSecretUpdates()
  if (!secretsSaved) {
    return
  }

  // Reload data from the new directory
  await Promise.all([
    threadStore.loadThreads(),
    qaStore.loadAllPairs(),
    tagStore.load(),
  ])
  toast.add({ severity: 'success', summary: 'Settings saved', life: 3000 })
  emit('close')
}

function clearRememberedMetadata() {
  uiStore.clearLastUsedMetadata()
  toast.add({ severity: 'info', summary: 'Remembered metadata cleared', life: 2000 })
}

async function testConnection() {
  testingConnection.value = true
  // Persist any typed key first so the main process tests the key the user sees.
  if (!await flushSecretUpdates()) {
    testingConnection.value = false
    return
  }
  const result = await window.api.aiTestConnection()
  testingConnection.value = false
  if (result.ok) {
    if (llmProvider.value === 'openai' || llmProvider.value === 'anthropic') {
      await loadModelCatalog(true)
    }
    toast.add({ severity: 'success', summary: 'Connection OK', detail: 'API key is valid', life: 3000 })
  } else {
    toast.add({ severity: 'error', summary: 'Connection failed', detail: result.error, life: 6000 })
  }
}

function handleKeydown(event: KeyboardEvent) {
  // Ctrl/Cmd+Enter saves. Escape is handled by the Dialog's own closeOnEscape.
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void save()
  }
}
</script>

<template>
  <Dialog
    :visible="true"
    modal
    :style="{ width: '640px', maxWidth: '94vw' }"
    :content-style="{ padding: '0' }"
    :dismissable-mask="true"
    class="settings-dialog"
    @update:visible="emit('close')"
    @keydown="handleKeydown"
  >
    <template #header>
      <h3 class="dialog-title">
        <i class="pi pi-cog" />Settings
      </h3>
    </template>

    <div
      class="settings-tabs"
      role="tablist"
      aria-label="Settings sections"
    >
      <button
        :class="{ active: activeTab === 'general' }"
        role="tab"
        :aria-selected="activeTab === 'general'"
        type="button"
        @click="activeTab = 'general'"
      >
        General
      </button>
      <button
        :class="{ active: activeTab === 'ai' }"
        role="tab"
        :aria-selected="activeTab === 'ai'"
        type="button"
        @click="activeTab = 'ai'"
      >
        AI
      </button>
      <button
        :class="{ active: activeTab === 'metadata' }"
        role="tab"
        :aria-selected="activeTab === 'metadata'"
        type="button"
        @click="activeTab = 'metadata'"
      >
        Metadata &amp; Tags
      </button>
    </div>

    <main class="settings-content">
      <section
        v-if="activeTab === 'general'"
        class="settings-section"
        role="tabpanel"
      >
        <div class="field">
          <label for="dataDirectory">Data directory</label>
          <div class="dir-row">
            <InputText
              id="dataDirectory"
              v-model="dataDirectory"
              class="dir-input"
              placeholder="Data directory"
            />
            <Button
              icon="pi pi-folder-open"
              outlined
              title="Browse for data directory"
              @click="pickDirectory"
            />
          </div>
        </div>
        <div class="field">
          <label>Appearance</label>
          <div class="checkbox-field">
            <Checkbox
              v-model="darkModeModel"
              input-id="darkMode"
              binary
            />
            <label
              for="darkMode"
              class="checkbox-label"
            >Dark mode</label>
          </div>
        </div>
      </section>

      <section
        v-else-if="activeTab === 'ai'"
        class="settings-section"
        role="tabpanel"
      >
        <div class="ai-preferences">
          <div class="checkbox-field">
            <Checkbox
              v-model="lensEnabled"
              input-id="lensEnabled"
              binary
            />
            <label
              for="lensEnabled"
              class="checkbox-label"
            >Enable LLM Lens</label>
          </div>
          <div
            v-if="isDevMode"
            class="checkbox-field"
          >
            <Checkbox
              v-model="allowDevEnvSecrets"
              input-id="allowDevEnvSecrets"
              binary
            />
            <label
              for="allowDevEnvSecrets"
              class="checkbox-label"
            >Use development environment variables for API keys</label>
          </div>
          <span
            v-if="isDevMode && allowDevEnvSecrets"
            class="field-help"
          >{{ devEnvVarNames.join(' / ') }}</span>
        </div>
        <div
          v-for="warning in storageWarnings"
          :key="warning.code"
          class="storage-warning"
        >
          {{ warning.message }}
        </div>
        <div
          v-if="secureStorageUnavailable"
          class="storage-warning storage-warning--blocking"
        >
          Secure storage is unavailable; API keys cannot be saved.
        </div>
        <div class="field">
          <label>Provider and model</label>
          <div class="ai-row">
            <Select
              v-model="llmProvider"
              :options="providerOptions"
              option-label="label"
              option-value="value"
              option-disabled="disabled"
              class="provider-select"
            />
            <Select
              v-model="llmModel"
              :options="modelOptions"
              option-label="label"
              option-value="value"
              class="model-select"
              :loading="loadingModelCatalog"
            />
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              size="small"
              title="Refresh available models"
              :loading="loadingModelCatalog"
              @click="loadModelCatalog(true)"
            />
          </div>
          <span
            v-if="modelHints.length"
            class="field-help"
          >{{ modelHints.join(' · ') }}</span>
          <span
            v-if="selectedProvider?.notes"
            class="field-help"
          >{{ selectedProvider.notes }}</span>
        </div>
        <div class="field">
          <label>{{ providerKeyLabel }}</label>
          <div class="ai-row">
            <Password
              v-model="currentKeyDraft"
              :placeholder="currentKeyPlaceholder"
              :disabled="currentKeyStatus?.readOnly"
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
          <span class="field-help">{{ currentKeySourceText }}</span>
          <div class="storage-check-action">
            <Button
              icon="pi pi-shield"
              severity="secondary"
              outlined
              size="small"
              label="Re-check secure storage"
              :loading="recheckingStorage"
              @click="recheckStorage"
            />
          </div>
        </div>
      </section>

      <section
        v-else
        class="settings-section"
        role="tabpanel"
      >
        <div class="field">
          <label>QA editor</label>
          <div class="checkbox-field">
            <Checkbox
              v-model="rememberLastMetadataModel"
              input-id="rememberMetadata"
              binary
            />
            <label
              for="rememberMetadata"
              class="checkbox-label"
            >Remember last-used source, tags, and URL</label>
          </div>
          <div class="metadata-actions">
            <Button
              label="Clear remembered metadata"
              severity="secondary"
              outlined
              size="small"
              @click="clearRememberedMetadata"
            />
          </div>
        </div>
        <div class="field">
          <label for="tagEnforcement">Tag enforcement</label>
          <Select
            id="tagEnforcement"
            v-model="tagEnforcement"
            :options="enforcementOptions"
            option-label="label"
            option-value="value"
            class="enforcement-select"
          />
        </div>
        <div
          v-if="tagEnforcement !== 'off'"
          class="limits-row"
        >
          <label for="tagSoftLimit">Soft limit</label>
          <input
            id="tagSoftLimit"
            v-model.number="tagSoftLimit"
            type="number"
            min="1"
            max="999"
            class="limit-input"
            title="Warn when vocabulary exceeds this size"
          >
          <label for="tagHardLimit">Hard limit</label>
          <input
            id="tagHardLimit"
            v-model.number="tagHardLimit"
            type="number"
            min="1"
            max="999"
            class="limit-input"
            title="Block new tags when vocabulary exceeds this size"
          >
          <span class="tag-dictionary-count">Tag dictionary: {{ tagStore.tagCount }} tags</span>
        </div>
        <span
          v-if="tagLimitError"
          class="limit-error"
        >{{ tagLimitError }}</span>
      </section>
    </main>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        outlined
        @click="emit('close')"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 2px;
  margin: 16px 20px 0;
  border-bottom: 1px solid var(--surface-border);
}

.settings-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
}

.settings-tabs button.active {
  border-bottom-color: var(--primary-color);
  color: var(--text-color);
  font-weight: 600;
}

.settings-content {
  overflow-y: auto;
  max-height: min(560px, calc(100vh - 240px));
  padding: 20px;
}

.settings-section {
  min-height: 260px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
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
  display: block;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 6px;
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

.ai-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.metadata-actions {
  margin-top: 10px;
}

.ai-preferences {
  margin-bottom: 16px;
}

.ai-preferences .checkbox-field:first-child {
  margin-top: 0;
}

.storage-check-action {
  margin-top: 8px;
}

.storage-warning {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--yellow-300, #f3d19e);
  background: var(--yellow-50, #fff8e6);
  color: var(--text-color, inherit);
  font-size: 0.85rem;
  line-height: 1.4;
}

.storage-warning--blocking {
  border-color: var(--red-300, #f0a9a7);
  background: var(--red-50, #fff5f5);
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

.enforcement-select {
  width: 220px;
}

.limits-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.limits-row label {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tag-dictionary-count {
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.limit-error {
  display: block;
  margin-top: 10px;
  color: var(--red-500, #dc2626);
  font-size: 12px;
}

.limit-input {
  width: 64px;
  padding: 4px 8px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--text-color);
  font-size: 13px;
}
</style>
