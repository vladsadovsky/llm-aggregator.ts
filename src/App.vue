<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import ThreadsPanel from './components/ThreadsPanel.vue'
import QAListPanel from './components/QAListPanel.vue'
import QAContentPanel from './components/QAContentPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { useThreadStore } from './stores/threadStore'
import { useQAStore } from './stores/qaStore'
import { useUIStore } from './stores/uiStore'
import { debugError } from './utils/logger'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const showSettings = ref(false)
const isLoading = ref(true)

onMounted(async () => {
  // Load threads and QA pairs in parallel; don't let one failure block the other
  const [threadResult, qaResult] = await Promise.allSettled([
    threadStore.loadThreads(),
    qaStore.loadAllPairs(),
  ])

  if (threadResult.status === 'rejected') {
    debugError('App', 'Failed to load threads:', threadResult.reason)
  }
  if (qaResult.status === 'rejected') {
    debugError('App', 'Failed to load QA pairs:', qaResult.reason)
  }

  // If there are no threads, default to showing all QAs so the user sees their content
  if (Object.keys(threadStore.threads).length === 0 && Object.keys(qaStore.pairs).length > 0) {
    uiStore.showAllQAs = true
  }

  isLoading.value = false

  // Add global keyboard event listener
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

function handleGlobalKeydown(event: KeyboardEvent) {
  // Ignore if user is typing in an input
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    // Allow Escape to work even in inputs
    if (event.key === 'Escape') {
      target.blur()
      if (showSettings.value) {
        showSettings.value = false
      }
    }
    return
  }

  // Ctrl/Cmd + F: Focus search
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    const searchInput = document.querySelector('.search-input input') as HTMLInputElement
    searchInput?.focus()
  }

  // Alt + N: New QA (Ctrl+N and Ctrl+Shift+N are reserved by Electron/Chromium)
  if (event.altKey && event.key === 'n') {
    event.preventDefault()
    uiStore.showQAEditor = true
  }

  // Ctrl/Cmd + , : Open settings
  if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault()
    showSettings.value = true
  }

  // Escape: Close dialogs
  if (event.key === 'Escape') {
    if (showSettings.value) {
      showSettings.value = false
    }
  }
}
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog />
  <SettingsDialog v-if="showSettings" @close="showSettings = false" />
  
  <!-- Loading screen -->
  <div v-if="isLoading" class="loading-screen">
    <div class="loading-content">
      <i class="pi pi-spin pi-spinner" style="font-size: 2rem; color: var(--primary-color)"></i>
      <p>Loading LLM Aggregator...</p>
    </div>
  </div>

  <div v-else class="app-container">
    <Splitter class="w-full h-full border-none">
      <SplitterPanel v-if="uiStore.isSidebarVisible" :size="uiStore.sidebarWidth" :minSize="10" class="app-sidebar">
        <div class="app-toolbar">
          <span class="app-brand">LLM Aggregator</span>
          <div class="toolbar-buttons">
            <Button
              icon="pi pi-angle-left"
              text
              rounded
              size="small"
              title="Hide sidebar"
              @click="uiStore.isSidebarVisible = false"
            />
          </div>
        </div>
        <ThreadsPanel />
      </SplitterPanel>
      
      <SplitterPanel :size="100 - (uiStore.isSidebarVisible ? uiStore.sidebarWidth : 0)">
        <Splitter class="w-full h-full border-none">
          <SplitterPanel :size="uiStore.isSidebarVisible ? 30 : 25" :minSize="15">
            <QAListPanel />
          </SplitterPanel>
          <SplitterPanel :size="uiStore.isSidebarVisible ? 70 : 75" :minSize="30">
            <div class="content-header-toolbar">
               <div class="spacer"></div>
               <div class="toolbar-buttons px-2 py-1">
                  <Button
                    :icon="uiStore.darkMode ? 'pi pi-sun' : 'pi pi-moon'"
                    text
                    rounded
                    size="small"
                    :title="uiStore.darkMode ? 'Light mode' : 'Dark mode'"
                    @click="uiStore.toggleDarkMode()"
                  />
                  <Button
                    icon="pi pi-cog"
                    text
                    rounded
                    size="small"
                    title="Settings (Ctrl+,)"
                    @click="showSettings = true"
                  />
               </div>
            </div>
            <QAContentPanel />
          </SplitterPanel>
        </Splitter>
      </SplitterPanel>
    </Splitter>
  </div>
</template>

<style scoped>
.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background: var(--surface-ground);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-content p {
  font-size: 14px;
  color: var(--text-color-secondary);
}

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

.toolbar-buttons {
  display: flex;
  gap: 4px;
}

:deep(.p-splitter) {
  background: transparent;
  color: inherit;
}

:deep(.p-splitter-gutter) {
  background: var(--border-color);
  transition: background 0.2s;
}

:deep(.p-splitter-gutter:hover) {
  background: var(--primary-color);
}
</style>
