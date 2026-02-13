<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
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
const showCommandPalette = ref(false)
const showShortcutsHelp = ref(false)
const commandQuery = ref('')
const isLoading = ref(true)

const modKeyLabel = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

const filteredCommands = computed(() => {
  const query = commandQuery.value.trim().toLowerCase()
  const commands = [
    { label: 'Focus Search', shortcut: `${modKeyLabel}+F`, action: focusSearch },
    { label: 'Create New QA', shortcut: `${modKeyLabel}+N`, action: openQAEditor },
    { label: 'Edit Selected QA', shortcut: 'E', action: requestEditSelectedQA },
    { label: 'Delete Selected QA', shortcut: 'Delete', action: requestDeleteSelectedQA },
    { label: 'Open Settings', shortcut: `${modKeyLabel}+,`, action: openSettings },
    { label: 'Show Shortcuts', shortcut: '?', action: openShortcutsHelp },
  ]

  if (!query) return commands
  return commands.filter((command) => {
    return (
      command.label.toLowerCase().includes(query) ||
      command.shortcut.toLowerCase().includes(query)
    )
  })
})

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

function isInputTarget(target: HTMLElement): boolean {
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function focusSearch() {
  const searchInput = document.querySelector('.search-input input') as HTMLInputElement | null
  searchInput?.focus()
  searchInput?.select()
}

function openQAEditor() {
  uiStore.showQAEditor = true
}

function openSettings() {
  showSettings.value = true
}

function openShortcutsHelp() {
  showShortcutsHelp.value = true
}

function openCommandPalette() {
  showCommandPalette.value = true
  commandQuery.value = ''
  void nextTick(() => {
    const input = document.querySelector('.command-palette input') as HTMLInputElement | null
    input?.focus()
  })
}

function closeOverlays() {
  if (showCommandPalette.value) {
    showCommandPalette.value = false
  } else if (showShortcutsHelp.value) {
    showShortcutsHelp.value = false
  } else if (showSettings.value) {
    showSettings.value = false
  } else {
    window.dispatchEvent(new Event('llm:cancel-current-edit'))
  }
}

function requestSaveCurrentEdit() {
  window.dispatchEvent(new Event('llm:save-current-edit'))
}

function requestRenameSelectedThread() {
  window.dispatchEvent(new Event('llm:rename-selected-thread'))
}

function requestEditSelectedQA() {
  window.dispatchEvent(new Event('llm:edit-selected-qa'))
}

function requestDeleteSelectedQA() {
  window.dispatchEvent(new Event('llm:delete-selected-qa'))
}

async function moveSelectedQA(direction: -1 | 1) {
  if (!threadStore.selectedThreadId || !qaStore.selectedPairId || uiStore.showAllQAs || uiStore.isEditing) {
    return
  }
  await threadStore.moveInThread(threadStore.selectedThreadId, qaStore.selectedPairId, direction)
}

function runCommand(action: () => void) {
  showCommandPalette.value = false
  action()
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const isMod = event.ctrlKey || event.metaKey
  const target = event.target as HTMLElement

  if (isMod && key === 's') {
    event.preventDefault()
    requestSaveCurrentEdit()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    if (isInputTarget(target)) {
      target.blur()
    }
    closeOverlays()
    return
  }

  if (isInputTarget(target)) return

  // Ctrl/Cmd + F and /: Focus search
  if ((isMod && key === 'f') || (!event.shiftKey && !isMod && !event.altKey && event.key === '/')) {
    event.preventDefault()
    focusSearch()
    return
  }

  // Ctrl/Cmd + N: New QA
  if (isMod && key === 'n') {
    event.preventDefault()
    openQAEditor()
    return
  }

  // Legacy fallback for older docs/behavior
  if (event.altKey && key === 'n') {
    event.preventDefault()
    openQAEditor()
    return
  }

  // Ctrl/Cmd + , : Open settings
  if (isMod && event.key === ',') {
    event.preventDefault()
    openSettings()
    return
  }

  // Alt + Up/Down: Move selected QA in current thread
  if (event.altKey && !isMod && !event.shiftKey && event.key === 'ArrowUp') {
    event.preventDefault()
    void moveSelectedQA(-1)
    return
  }

  if (event.altKey && !isMod && !event.shiftKey && event.key === 'ArrowDown') {
    event.preventDefault()
    void moveSelectedQA(1)
    return
  }

  // F2: Rename selected thread
  if (event.key === 'F2') {
    event.preventDefault()
    requestRenameSelectedThread()
    return
  }

  // E: Edit selected QA
  if (!isMod && !event.altKey && !event.shiftKey && key === 'e') {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestEditSelectedQA()
    return
  }

  // Delete/Backspace: Delete selected QA
  if ((event.key === 'Delete' || event.key === 'Backspace') && !isMod && !event.altKey && !event.shiftKey) {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestDeleteSelectedQA()
    return
  }

  // Ctrl/Cmd + K: Open command palette
  if (isMod && key === 'k') {
    event.preventDefault()
    openCommandPalette()
    return
  }

  // ?: Show keyboard shortcuts
  if (event.key === '?') {
    event.preventDefault()
    openShortcutsHelp()
  }
}
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog />
  <SettingsDialog v-if="showSettings" @close="showSettings = false" />
  <div
    v-if="showCommandPalette"
    class="overlay"
    @click.self="showCommandPalette = false"
  >
    <div class="command-palette">
      <InputText
        v-model="commandQuery"
        placeholder="Type a command..."
        class="w-full"
      />
      <div class="command-list">
        <button
          v-for="command in filteredCommands"
          :key="command.label"
          class="command-item"
          @click="runCommand(command.action)"
        >
          <span>{{ command.label }}</span>
          <kbd>{{ command.shortcut }}</kbd>
        </button>
        <p v-if="filteredCommands.length === 0" class="command-empty">
          No commands match.
        </p>
      </div>
    </div>
  </div>
  <div
    v-if="showShortcutsHelp"
    class="overlay"
    @click.self="showShortcutsHelp = false"
  >
    <div class="shortcuts-dialog">
      <h3>Keyboard Shortcuts</h3>
      <table>
        <tbody>
          <tr><td>{{ modKeyLabel }}+F or /</td><td>Focus search</td></tr>
          <tr><td>{{ modKeyLabel }}+N</td><td>Create new QA</td></tr>
          <tr><td>{{ modKeyLabel }}+S</td><td>Save while editing</td></tr>
          <tr><td>{{ modKeyLabel }}+,</td><td>Open settings</td></tr>
          <tr><td>Escape</td><td>Close dialog / cancel current action</td></tr>
          <tr><td>F2 (Fn+F2 on some Macs)</td><td>Rename selected thread</td></tr>
          <tr><td>Alt+Up / Alt+Down</td><td>Move selected QA in thread</td></tr>
          <tr><td>E</td><td>Edit selected QA</td></tr>
          <tr><td>Delete (Backspace on many Macs)</td><td>Delete selected QA</td></tr>
          <tr><td>{{ modKeyLabel }}+K</td><td>Open command palette</td></tr>
          <tr><td>?</td><td>Show this help</td></tr>
          <tr><td>{{ modKeyLabel }}+Enter</td><td>Submit QA form</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  
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
                    :title="`Settings (${modKeyLabel}+,)`"
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

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.command-palette {
  width: 560px;
  max-width: 90vw;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 12px;
}

.command-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.command-item {
  border: none;
  background: transparent;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-color);
}

.command-item:hover {
  background: var(--surface-hover);
}

.command-item kbd {
  font-size: 11px;
  color: var(--text-color-secondary);
  background: var(--surface-200);
  border-radius: 5px;
  padding: 2px 6px;
}

.command-empty {
  color: var(--text-color-secondary);
  font-size: 12px;
  margin: 8px;
}

.shortcuts-dialog {
  width: 620px;
  max-width: 92vw;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 18px;
}

.shortcuts-dialog h3 {
  margin: 0 0 12px;
}

.shortcuts-dialog table {
  width: 100%;
  border-collapse: collapse;
}

.shortcuts-dialog td {
  border-top: 1px solid var(--border-color);
  padding: 8px 0;
  font-size: 13px;
}

.shortcuts-dialog td:first-child {
  width: 45%;
  color: var(--text-color-secondary);
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
