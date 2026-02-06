<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Button from 'primevue/button'
import ThreadsPanel from './components/ThreadsPanel.vue'
import QAListPanel from './components/QAListPanel.vue'
import QAContentPanel from './components/QAContentPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { useThreadStore } from './stores/threadStore'
import { useQAStore } from './stores/qaStore'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const showSettings = ref(false)

onMounted(async () => {
  await threadStore.loadThreads()
  await qaStore.loadAllPairs()
})
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog />
  <SettingsDialog v-if="showSettings" @close="showSettings = false" />
  <div class="app-container">
    <div class="app-sidebar">
      <div class="app-toolbar">
        <span class="app-brand">LLM Aggregator</span>
        <Button
          icon="pi pi-cog"
          text
          rounded
          size="small"
          title="Settings"
          @click="showSettings = true"
        />
      </div>
      <ThreadsPanel />
    </div>
    <QAListPanel />
    <QAContentPanel />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.app-brand {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  letter-spacing: 0.02em;
}
</style>
