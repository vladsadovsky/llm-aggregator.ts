<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useThreadStore } from '../stores/threadStore'
import { useQAStore } from '../stores/qaStore'
import { useUIStore } from '../stores/uiStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'

const emit = defineEmits<{
  close: []
}>()

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const toast = useToast()

const dataDirectory = ref('')
const rememberLastMetadataModel = computed({
  get: () => uiStore.rememberLastMetadata,
  set: (value: boolean) => uiStore.setRememberLastMetadata(Boolean(value)),
})

onMounted(async () => {
  const settings = await window.api.settingsLoad()
  dataDirectory.value = settings.dataDirectory
})

async function pickDirectory() {
  const dir = await window.api.settingsPickDirectory()
  if (dir) {
    dataDirectory.value = dir
  }
}

async function save() {
  await window.api.settingsSave({ dataDirectory: dataDirectory.value })
  // Reload data from the new directory
  await threadStore.loadThreads()
  await qaStore.loadAllPairs()
  toast.add({ severity: 'success', summary: 'Settings saved', detail: 'Data directory updated', life: 3000 })
  emit('close')
}

function clearRememberedMetadata() {
  uiStore.clearLastUsedMetadata()
  toast.add({ severity: 'info', summary: 'Remembered metadata cleared', life: 2000 })
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

.button-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
</style>
