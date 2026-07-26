<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useTagStore } from '../stores/tagStore'
import type { AppSettings, ModelCatalogResult, ProviderDescriptor, SecretsStatus } from '../global'

const emit = defineEmits<{ close: [] }>()

const tagStore = useTagStore()
const loading = ref(true)
const error = ref('')
const settings = ref<AppSettings | null>(null)
const secrets = ref<SecretsStatus | null>(null)
const providers = ref<ProviderDescriptor[]>([])
const modelCatalog = ref<ModelCatalogResult | null>(null)

function keyStatus(provider: string): string {
  const key = provider === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey'
  const status = secrets.value?.keys[key]
  if (!status?.hasKey) return 'Not configured'
  return status.source === 'env' ? 'Development environment' : 'Encrypted local storage'
}

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    const [loadedSettings, loadedSecrets, loadedProviders] = await Promise.all([
      window.api.settingsLoad(),
      window.api.secretsLoad(),
      window.api.aiListProviders(),
    ])
    settings.value = loadedSettings
    secrets.value = loadedSecrets
    providers.value = loadedProviders
    modelCatalog.value = await window.api.aiListModels(loadedSettings.llmProvider)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadStatus())
</script>

<template>
  <Dialog
    :visible="true"
    modal
    header="Application Status"
    :style="{ width: '640px', maxWidth: '94vw' }"
    @update:visible="emit('close')"
  >
    <div class="status-body">
      <p v-if="loading" class="status-message">Loading status...</p>
      <template v-else-if="settings && secrets">
        <section class="status-section">
          <h4>Archive</h4>
          <dl>
            <dt>Data directory</dt>
            <dd class="path-value">{{ settings.dataDirectory }}</dd>
            <dt>Tags</dt>
            <dd>{{ tagStore.tagCount }} in dictionary; enforcement {{ settings.tagEnforcement }}</dd>
            <dt>LLM Lens</dt>
            <dd>{{ settings.lensEnabled ? 'Enabled' : 'Disabled' }}</dd>
          </dl>
        </section>

        <section class="status-section">
          <h4>AI</h4>
          <dl>
            <dt>Provider</dt>
            <dd>{{ providers.find(provider => provider.id === settings?.llmProvider)?.label ?? settings?.llmProvider }}</dd>
            <dt>Model</dt>
            <dd>{{ settings.llmModel }}</dd>
            <dt>API key</dt>
            <dd>{{ keyStatus(settings.llmProvider) }}</dd>
            <dt>Model catalog</dt>
            <dd>{{ modelCatalog?.source ?? 'Unavailable' }}<template v-if="modelCatalog?.fetchedAt">, {{ new Date(modelCatalog.fetchedAt).toLocaleString() }}</template></dd>
          </dl>
        </section>

        <section class="status-section">
          <h4>Secure Storage</h4>
          <dl>
            <template v-for="backend in secrets.backends" :key="backend.id">
              <dt>{{ backend.id }}</dt>
              <dd>{{ backend.available ? (backend.writable ? 'Available' : 'Read only') : 'Unavailable' }}</dd>
            </template>
          </dl>
          <ul v-if="secrets.warnings.length" class="warnings">
            <li v-for="warning in secrets.warnings" :key="warning.code">{{ warning.message }}</li>
          </ul>
          <p v-else class="status-message">No storage warnings.</p>
        </section>
      </template>
      <p v-else class="status-message error-message">{{ error || 'Status information is unavailable.' }}</p>
    </div>
    <template #footer>
      <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="loadStatus" />
      <Button label="Close" @click="emit('close')" />
    </template>
  </Dialog>
</template>

<style scoped>
.status-body {
  max-height: min(560px, calc(100vh - 220px));
  overflow-y: auto;
}

.status-section + .status-section {
  border-top: 1px solid var(--surface-border);
  margin-top: 16px;
  padding-top: 16px;
}

.status-section h4 {
  font-size: 14px;
  margin: 0 0 10px;
}

.status-section dl {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
}

.status-section dt {
  color: var(--text-color-secondary);
}

.status-section dd {
  margin: 0;
}

.path-value {
  overflow-wrap: anywhere;
}

.status-message,
.warnings {
  color: var(--text-color-secondary);
  font-size: 13px;
  margin: 0;
}

.warnings {
  margin-top: 10px;
  padding-left: 20px;
}

.error-message {
  color: var(--red-500, #dc2626);
}
</style>
