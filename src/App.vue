<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, onErrorCaptured } from 'vue'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ConfirmDialog from 'primevue/confirmdialog'
import Dialog from 'primevue/dialog'
import ThreadsPanel from './components/ThreadsPanel.vue'
import QAListPanel from './components/QAListPanel.vue'
import QAContentPanel from './components/QAContentPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import ApplicationStatusDialog from './components/ApplicationStatusDialog.vue'
import AnnotationDialog from './components/AnnotationDialog.vue'
import HealthReportDialog from './components/HealthReportDialog.vue'
import TagManagerDialog from './components/TagManagerDialog.vue'
import InsightsPanel from './components/InsightsPanel.vue'
import SharedLinkImportDialog from './components/SharedLinkImportDialog.vue'
import { useThreadStore } from './stores/threadStore'
import { useQAStore } from './stores/qaStore'
import { useUIStore } from './stores/uiStore'
import { useTagStore } from './stores/tagStore'
import { debugError, debugLog } from './utils/logger'
import type { ImportResult, SharedImportResult } from './global'

const threadStore = useThreadStore()
const qaStore = useQAStore()
const uiStore = useUIStore()
const tagStore = useTagStore()
const toast = useToast()
const showSettings = ref(false)
const showApplicationStatus = ref(false)
const showAnnotationDialog = ref(false)
const showHealthDialog = ref(false)
const showTagManager = ref(false)
const generatingEmbeddings = ref(false)
const insightsPanelRef = ref<InstanceType<typeof InsightsPanel> | null>(null)
const lensEnabled = ref(false)
const showCommandPalette = ref(false)
const showShortcutsHelp = ref(false)
const commandQuery = ref('')
const isLoading = ref(true)
const showImportSummary = ref(false)
const importSummaryResult = ref<ImportResult | null>(null)
const showSharedLinkImport = ref(false)
const sharedImportBusy = ref(false)
const sharedImportResult = ref<SharedImportResult | null>(null)
const sharedImportError = ref('')
let disposeMenuListener: (() => void) | null = null

const modKeyLabel = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

// ─── Central command registry ───────────────────────────────────────────────
// Single source of truth for every end-user action. Both the command palette
// and the native application menu (via the `menu-action` IPC channel) drive
// these. Keyboard shortcuts remain owned by handleGlobalKeydown; `shortcut`
// here is a display hint only.
interface AppCommand {
  id: string
  label: string
  shortcut: string
  run: () => void
}

const appCommands: AppCommand[] = [
  { id: 'search.focus', label: 'Focus Search', shortcut: `${modKeyLabel}+F`, run: focusSearch },
  { id: 'qa.new', label: 'New Q&A', shortcut: `${modKeyLabel}+N`, run: openQAEditor },
  { id: 'qa.edit', label: 'Edit Selected Q&A', shortcut: 'E', run: requestEditSelectedQA },
  { id: 'qa.duplicate', label: 'Duplicate Selected Q&A', shortcut: 'D', run: requestDuplicateSelectedQA },
  { id: 'qa.delete', label: 'Delete Selected Q&A', shortcut: 'Delete', run: requestDeleteSelectedQA },
  { id: 'qa.save', label: 'Save Changes', shortcut: `${modKeyLabel}+S`, run: requestSaveCurrentEdit },
  { id: 'qa.moveUp', label: 'Move Q&A Up in Thread', shortcut: 'Alt+Up', run: () => void moveSelectedQA(-1) },
  { id: 'qa.moveDown', label: 'Move Q&A Down in Thread', shortcut: 'Alt+Down', run: () => void moveSelectedQA(1) },
  { id: 'io.export', label: 'Export Selected Q&A / Thread', shortcut: 'X', run: requestExportSelected },
  { id: 'io.importFile', label: 'Import from File', shortcut: `${modKeyLabel}+O`, run: () => void importFile() },
  { id: 'io.importSharedLink', label: 'Import from Shared Link', shortcut: `${modKeyLabel}+Shift+O`, run: openSharedLinkImport },
  { id: 'thread.new', label: 'New Thread', shortcut: '', run: requestNewThread },
  { id: 'thread.rename', label: 'Rename Selected Thread', shortcut: 'F2', run: requestRenameSelectedThread },
  { id: 'view.showAll', label: 'Show All Q&As', shortcut: '', run: requestShowAllQAs },
  { id: 'view.showUnthreaded', label: 'Show Unthreaded Q&As', shortcut: '', run: requestShowUnthreaded },
  { id: 'view.toggleThreads', label: 'Toggle Threads Panel', shortcut: '', run: toggleThreadsPanel },
  { id: 'view.toggleList', label: 'Toggle List Panel', shortcut: '', run: toggleListPanel },
  { id: 'view.zoomIn', label: 'Zoom Content In', shortcut: '', run: () => uiStore.zoomIn() },
  { id: 'view.zoomOut', label: 'Zoom Content Out', shortcut: '', run: () => uiStore.zoomOut() },
  { id: 'view.zoomReset', label: 'Reset Content Zoom', shortcut: '', run: () => uiStore.zoomReset() },
  { id: 'view.darkMode', label: 'Toggle Dark Mode', shortcut: '', run: () => uiStore.toggleDarkMode() },
  { id: 'view.lens', label: 'Toggle LLM Lens', shortcut: '', run: () => insightsPanelRef.value?.toggle() },
  { id: 'view.status', label: 'Application Status', shortcut: '', run: () => { showApplicationStatus.value = true } },
  { id: 'view.manageTags', label: 'Manage Tag Dictionary', shortcut: '', run: () => { showTagManager.value = true } },
  { id: 'view.generateEmbeddings', label: 'Generate All Embeddings', shortcut: '', run: () => void generateAllEmbeddings() },
  { id: 'view.annotationPass', label: 'Run Confidence Annotation Pass', shortcut: '', run: () => { showAnnotationDialog.value = true } },
  { id: 'view.healthCheck', label: 'Run Archive Health Check', shortcut: '', run: () => { showHealthDialog.value = true } },
  { id: 'app.settings', label: 'Open Settings', shortcut: `${modKeyLabel}+,`, run: openSettings },
  { id: 'app.commandPalette', label: 'Open Command Palette', shortcut: `${modKeyLabel}+K`, run: openCommandPalette },
  { id: 'app.shortcuts', label: 'Keyboard Shortcuts', shortcut: '?', run: openShortcutsHelp },
]

function handleMenuAction(action: string) {
  if (action === 'view.lens' && !lensEnabled.value) return
  const command = appCommands.find((c) => c.id === action)
  command?.run()
}

const filteredCommands = computed(() => {
  const query = commandQuery.value.trim().toLowerCase()
  // Exclude "Open Command Palette" — you're already in it here.
  const commands = appCommands.filter((c) =>
    c.id !== 'app.commandPalette' && (lensEnabled.value || c.id !== 'view.lens'),
  )
  if (!query) return commands
  return commands.filter((command) => {
    return (
      command.label.toLowerCase().includes(query) ||
      command.shortcut.toLowerCase().includes(query)
    )
  })
})

onMounted(async () => {
  // Load threads, QA pairs, and tag dictionary in parallel; don't let one failure block the others
  const [threadResult, qaResult, settingsResult] = await Promise.allSettled([
    threadStore.loadThreads(),
    qaStore.loadAllPairs(),
    window.api.settingsLoad(),
  ])
  // Tag store loads independently — failure is non-fatal
  tagStore.load().catch(() => {})

  if (threadResult.status === 'rejected') {
    debugError('App', 'Failed to load threads:', threadResult.reason)
    const reason = threadResult.reason instanceof Error ? threadResult.reason.message : String(threadResult.reason)
    toast?.add({ severity: 'error', summary: 'Error', detail: 'Failed to load threads: ' + reason, life: 5000 })
  }
  if (qaResult.status === 'rejected') {
    debugError('App', 'Failed to load QA pairs:', qaResult.reason)
    const reason = qaResult.reason instanceof Error ? qaResult.reason.message : String(qaResult.reason)
    toast?.add({ severity: 'error', summary: 'Error', detail: 'Failed to load QA pairs: ' + reason, life: 5000 })
  }
  if (settingsResult.status === 'fulfilled') {
    lensEnabled.value = settingsResult.value.lensEnabled
  }

  // If there are no threads, default to showing all QAs so the user sees their content
  if (Object.keys(threadStore.threads).length === 0 && Object.keys(qaStore.pairs).length > 0) {
    uiStore.showAllQAs = true
  }

  uiStore.isSidebarVisible = !uiStore.threadsCollapsed

  isLoading.value = false

  // Add global keyboard event listener
  window.addEventListener('keydown', handleGlobalKeydown)
  // Import actions dispatched from the Threads-panel Import menu
  window.addEventListener('llm:import-file', handleImportFileEvent)
  window.addEventListener('llm:import-shared-link', handleImportSharedLinkEvent)
  // Native application-menu items route here
  disposeMenuListener = window.api.onMenuAction?.(handleMenuAction) ?? null
})

function handleImportFileEvent() {
  void importFile()
}

function handleImportSharedLinkEvent() {
  openSharedLinkImport()
}

onErrorCaptured((err: any) => {
  debugError('App', 'Unhandled error:', err)
  toast?.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : String(err), life: 5000 })
  return false
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('llm:import-file', handleImportFileEvent)
  window.removeEventListener('llm:import-shared-link', handleImportSharedLinkEvent)
  disposeMenuListener?.()
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
  uiStore.clearQAEditorDraft()
  uiStore.showQAEditor = true
}

function openSettings() {
  showSettings.value = true
}

function handleSettingsSaved(updatedLensEnabled: boolean) {
  lensEnabled.value = updatedLensEnabled
}

async function generateAllEmbeddings() {
  generatingEmbeddings.value = true
  try {
    const result = await window.api.aiGenerateAllEmbeddings()
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

function requestNewThread() {
  window.dispatchEvent(new Event('llm:new-thread'))
}

function requestShowAllQAs() {
  window.dispatchEvent(new Event('llm:show-all-qas'))
}

function requestShowUnthreaded() {
  window.dispatchEvent(new Event('llm:show-unthreaded'))
}

function requestEditSelectedQA() {
  window.dispatchEvent(new Event('llm:edit-selected-qa'))
}

function requestDeleteSelectedQA() {
  window.dispatchEvent(new Event('llm:delete-selected-qa'))
}

function requestDuplicateSelectedQA() {
  window.dispatchEvent(new Event('llm:duplicate-selected-qa'))
}

function requestExportSelected() {
  // QA has priority; fall back to active thread if no QA selected
  if (qaStore.selectedPairId) {
    window.dispatchEvent(new Event('llm:export-selected-qa'))
  } else if (threadStore.selectedThreadId) {
    void exportSelectedThread()
  }
}

async function exportSelectedThread() {
  if (!threadStore.selectedThreadId) return
  const result = await window.api.exportThread(threadStore.selectedThreadId)
  if (result) {
    const filename = result.savedPath.split(/[/\\]/).pop() ?? result.savedPath
    toast?.add({ severity: 'success', summary: 'Thread exported', detail: `Saved to ${filename}`, life: 3000 })
  }
}

async function importFile() {
  const result = await window.api.importFromFile()
  if (!result) return // user cancelled

  const createdIds: string[] = []
  for (const item of result.items) {
    try {
      const created = await qaStore.createPair(item.data)
      createdIds.push(created.id)
    } catch (err) {
      debugError('App', 'importFile: createPair failed for item', item.data.title, err)
    }
  }

  // If thread export, reconstruct thread with the newly created IDs in order
  if (result.exportType === 'thread' && result.threadName && createdIds.length > 0) {
    const tid = await threadStore.createThread(result.threadName)
    for (const id of createdIds) {
      await threadStore.addToThread(tid, id)
    }
  }

  // Reload so UI reflects new items
  await qaStore.loadAllPairs()
  await threadStore.loadThreads()

  const allWarnings = [
    ...result.fileWarnings,
    ...result.items.flatMap((i) => i.warnings),
  ]
  const hasWarnings = allWarnings.length > 0
  const severity = hasWarnings ? 'warn' : 'success'
  const summary = hasWarnings ? 'Import completed with warnings' : 'Import successful'
  const detail = `${createdIds.length} QA${createdIds.length !== 1 ? 's' : ''} imported`
  toast?.add({ severity, summary, detail, life: 4000 })

  if (hasWarnings) {
    importSummaryResult.value = result
    showImportSummary.value = true
  }
}

function openSharedLinkImport() {
  debugLog('sharedImportTrace', 'opening shared-link import dialog')
  sharedImportResult.value = null
  sharedImportError.value = ''
  sharedImportBusy.value = false
  showSharedLinkImport.value = true
}

async function handleSharedLinkImport(url: string) {
  debugLog('sharedImportTrace', 'submit start', {
    url,
    selectedThreadId: threadStore.selectedThreadId,
  })
  sharedImportBusy.value = true
  sharedImportError.value = ''
  try {
    const result = await window.api.importSharedLink(url)
    debugLog('sharedImportTrace', 'provider result received', {
      provider: result.provider,
      model: result.model,
      threadName: result.threadName,
      titleWasDerived: result.titleWasDerived,
      tags: result.tags,
      items: result.items.length,
      warnings: result.warnings.length,
      firstItem: result.items[0]
        ? {
            title: result.items[0].data.title,
            source: result.items[0].data.source,
            questionLength: result.items[0].data.question.length,
            answerLength: result.items[0].data.answer.length,
            warnings: result.items[0].warnings,
          }
        : null,
    })

    // Create every QA pair, preserving conversation order.
    const createdIds: string[] = []
    for (const item of result.items) {
      debugLog('sharedImportTrace', 'creating QA from imported item', {
        title: item.data.title,
        source: item.data.source,
        tags: item.data.tags,
        questionLength: item.data.question.length,
        answerLength: item.data.answer.length,
        warnings: item.warnings,
      })
      try {
        const created = await qaStore.createPair(item.data)
        createdIds.push(created.id)
        debugLog('sharedImportTrace', 'createPair success', {
          createdId: created.id,
          title: created.title,
          createdCount: createdIds.length,
        })
      } catch (err) {
        debugError('App', 'handleSharedLinkImport: createPair failed for', item.data.title, err)
      }
    }

    debugLog('sharedImportTrace', 'createPair phase completed', {
      importedItems: result.items.length,
      createdIds,
      failedCreates: result.items.length - createdIds.length,
    })

    // Create the thread, tag it with provider/model, and add pairs in order.
    if (createdIds.length > 0) {
      debugLog('sharedImportTrace', 'creating thread for imported QAs', {
        threadName: result.threadName,
        createdIds,
      })
      const tid = await threadStore.createThread(result.threadName)
      debugLog('sharedImportTrace', 'thread created', {
        threadId: tid,
        initialItems: threadStore.threads[tid]?.items ?? null,
      })
      if (result.tags.length > 0) {
        await threadStore.updateThread(tid, result.threadName, result.tags)
        debugLog('sharedImportTrace', 'thread tags applied', {
          threadId: tid,
          tags: result.tags,
        })
      }
      for (const id of createdIds) {
        debugLog('sharedImportTrace', 'addToThread start', { threadId: tid, pairId: id })
        await threadStore.addToThread(tid, id)
        debugLog('sharedImportTrace', 'addToThread completed', {
          threadId: tid,
          pairId: id,
          currentItems: threadStore.threads[tid]?.items ?? null,
        })
      }
      await qaStore.loadAllPairs()
      await threadStore.loadThreads()
      debugLog('sharedImportTrace', 'post-reload thread snapshot', {
        threadId: tid,
        exists: Boolean(threadStore.threads[tid]),
        itemCount: threadStore.threads[tid]?.items?.length ?? 0,
        items: threadStore.threads[tid]?.items ?? [],
      })

      // Ensure we exit virtual/archive views so the imported thread is shown directly.
      uiStore.showAllQAs = false
      uiStore.showUnthreaded = false
      uiStore.showGlobalSearchResults = false
      uiStore.globalSearchResultIds = null
      uiStore.searchScope = 'thread'

      threadStore.selectThread(tid)
      if (createdIds.length > 0) {
        qaStore.selectPair(createdIds[0])
      }
    }

    sharedImportResult.value = result

    const detail = `${createdIds.length} QA${createdIds.length !== 1 ? 's' : ''} imported from ${result.model}`
    if (result.titleWasDerived) {
      toast?.add({ severity: 'warn', summary: 'Imported — please rename the thread', detail, life: 6000 })
    } else {
      toast?.add({ severity: 'success', summary: 'Import successful', detail, life: 4000 })
    }
  } catch (err) {
    sharedImportError.value = (err as Error).message || 'Import failed.'
    debugError('App', 'handleSharedLinkImport failed', err)
  } finally {
    sharedImportBusy.value = false
  }
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

function toggleThreadsPanel() {
  uiStore.toggleThreads()
  uiStore.isSidebarVisible = !uiStore.threadsCollapsed
}

function toggleListPanel() {
  uiStore.toggleList()
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

  // The command palette is global: it must work even when an input retains focus.
  if (isMod && key === 'k') {
    event.preventDefault()
    openCommandPalette()
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

  // D: Duplicate selected QA into create form
  if (!isMod && !event.altKey && !event.shiftKey && key === 'd') {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestDuplicateSelectedQA()
    return
  }

  // X: Export active selection (QA priority, falls back to thread)
  if (!isMod && !event.altKey && !event.shiftKey && key === 'x') {
    if (uiStore.isEditing) return
    if (qaStore.selectedPairId || threadStore.selectedThreadId) {
      event.preventDefault()
      requestExportSelected()
    }
    return
  }

  // Ctrl/Cmd + Shift + O: Import from shared link
  if (isMod && event.shiftKey && key === 'o') {
    event.preventDefault()
    openSharedLinkImport()
    return
  }

  // Ctrl/Cmd + O: Import from file
  if (isMod && !event.shiftKey && key === 'o') {
    event.preventDefault()
    void importFile()
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
  <SettingsDialog
    v-if="showSettings"
    @close="showSettings = false"
    @saved="handleSettingsSaved"
  />
  <ApplicationStatusDialog
    v-if="showApplicationStatus"
    @close="showApplicationStatus = false"
  />
  <AnnotationDialog
    v-if="showAnnotationDialog"
    @close="showAnnotationDialog = false"
  />
  <HealthReportDialog
    v-if="showHealthDialog"
    @close="showHealthDialog = false"
  />
  <TagManagerDialog
    v-if="showTagManager"
    @close="showTagManager = false"
  />
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
          @click="runCommand(command.run)"
        >
          <span>{{ command.label }}</span>
          <kbd v-if="command.shortcut">{{ command.shortcut }}</kbd>
        </button>
        <p
          v-if="filteredCommands.length === 0"
          class="command-empty"
        >
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
          <tr><td>D</td><td>Duplicate selected QA into new form</td></tr>
          <tr><td>{{ modKeyLabel }}+K</td><td>Open command palette</td></tr>
          <tr><td>X</td><td>Export selected QA or thread to file</td></tr>
          <tr><td>{{ modKeyLabel }}+O</td><td>Import from file</td></tr>
          <tr><td>{{ modKeyLabel }}+Shift+O</td><td>Import from shared link</td></tr>
          <tr><td>?</td><td>Show this help</td></tr>
          <tr><td>{{ modKeyLabel }}+Enter</td><td>Submit QA form</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <!-- Import summary dialog -->
  <Dialog
    v-model:visible="showImportSummary"
    header="Import Summary"
    :modal="true"
    :closable="true"
    :style="{ width: '560px', maxWidth: '90vw' }"
    data-testid="import-summary-dialog"
  >
    <div v-if="importSummaryResult">
      <p
        v-if="importSummaryResult.fileWarnings.length > 0"
        class="import-section-label"
      >
        File warnings
      </p>
      <ul
        v-if="importSummaryResult.fileWarnings.length > 0"
        class="import-warnings-list"
      >
        <li
          v-for="(w, i) in importSummaryResult.fileWarnings"
          :key="'fw-' + i"
        >
          {{ w }}
        </li>
      </ul>
      <p
        v-if="importSummaryResult.items.some(it => it.warnings.length > 0)"
        class="import-section-label"
      >
        Item warnings
      </p>
      <ul class="import-warnings-list">
        <template
          v-for="(item, idx) in importSummaryResult.items"
          :key="idx"
        >
          <li
            v-for="(w, wi) in item.warnings"
            :key="idx + '-' + wi"
          >
            {{ w }}
          </li>
        </template>
      </ul>
    </div>
    <template #footer>
      <Button
        label="Close"
        @click="showImportSummary = false"
      />
    </template>
  </Dialog>

  <!-- Shared-link import dialog -->
  <SharedLinkImportDialog
    v-model:visible="showSharedLinkImport"
    :busy="sharedImportBusy"
    :result="sharedImportResult"
    :error="sharedImportError"
    @submit="handleSharedLinkImport"
  />

  <!-- Loading screen -->
  <div
    v-if="isLoading"
    class="loading-screen"
  >
    <div class="loading-content">
      <i
        class="pi pi-spin pi-spinner"
        style="font-size: 2rem; color: var(--primary-color)"
      />
      <p>Loading LLM Aggregator...</p>
    </div>
  </div>

  <div
    v-else
    class="app-container"
    :class="{ 'app-container--lens-enabled': lensEnabled }"
  >
    <div
      class="panel-wrap"
      :class="{ collapsed: uiStore.threadsCollapsed }"
    >
      <div class="panel-content panel-content--threads">
        <div class="app-toolbar">
          <span class="app-brand">LLM Aggregator</span>
        </div>
        <ThreadsPanel />
      </div>
      <button
        class="panel-toggle"
        data-testid="threads-panel-toggle"
        :title="uiStore.threadsCollapsed ? 'Expand threads' : 'Collapse threads'"
        @click="toggleThreadsPanel"
      >
        <i :class="uiStore.threadsCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" />
      </button>
    </div>

    <div
      class="panel-wrap panel-wrap--list"
      :class="{ collapsed: uiStore.listCollapsed }"
    >
      <div class="panel-content panel-content--list">
        <QAListPanel />
      </div>
      <button
        class="panel-toggle"
        data-testid="list-panel-toggle"
        :title="uiStore.listCollapsed ? 'Expand list' : 'Collapse list'"
        @click="toggleListPanel"
      >
        <i :class="uiStore.listCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" />
      </button>
    </div>

    <div class="content-wrap">
      <div class="content-header-toolbar">
        <div class="spacer breadcrumb">
          <template v-if="uiStore.showAllQAs">
            <span
              class="bc-item"
              @click="uiStore.showAllQAs = true"
            >All QAs</span>
          </template>
          <template v-else-if="threadStore.selectedThreadId">
            <span
              class="bc-item"
              @click="uiStore.showAllQAs = false"
            >Threads</span>
            <i class="pi pi-angle-right bc-separator" />
            <span class="bc-item bc-active">{{ threadStore.selectedThread?.name }}</span>
          </template>
          <template v-else-if="uiStore.showUnthreaded">
            <span class="bc-item">Unthreaded</span>
          </template>
          <template v-if="qaStore.selectedPair()">
            <i class="pi pi-angle-right bc-separator" />
            <span
              class="bc-item bc-active qa-title"
              :title="qaStore.selectedPair()!.title"
            >{{ qaStore.selectedPair()!.title }}</span>
          </template>
        </div>
        <div class="toolbar-buttons px-2 py-1">
          <Button
            v-if="lensEnabled"
            icon="pi pi-sparkles"
            text
            rounded
            size="small"
            title="Lens — Session Brief / Prior Art"
            @click="insightsPanelRef?.toggle()"
          />
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
    </div>
  </div>
  <InsightsPanel
    v-if="lensEnabled"
    ref="insightsPanelRef"
  />
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
  box-sizing: border-box;
}

.app-container--lens-enabled {
  padding-bottom: 36px; /* reserve space for the Lens strip */
}

.panel-wrap {
  display: flex;
  height: 100%;
  flex-shrink: 0;
}

.panel-content {
  overflow: hidden;
  transition: width 0.2s ease;
}

.panel-content--threads {
  width: 260px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-content--list {
  width: 340px;
  height: 100%;
}

.panel-wrap.collapsed .panel-content {
  width: 0;
}

.panel-toggle {
  width: 14px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--surface-ground);
  border: none;
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  color: var(--text-color-secondary);
  padding: 0;
  font-size: 10px;
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}

.panel-toggle:hover {
  opacity: 1;
  background: var(--surface-hover);
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-wrap {
  min-width: 0;
  flex: 1;
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

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
  flex: 1;
  padding: 0 12px;
  overflow: hidden;
}

.bc-item {
  cursor: pointer;
  transition: color 0.15s ease;
  white-space: nowrap;
}

.bc-item:hover {
  color: var(--primary-color);
}

.bc-active {
  color: var(--text-color);
  font-weight: 500;
  cursor: default;
}

.bc-active:hover {
  color: var(--text-color);
}

.bc-separator {
  font-size: 10px;
  opacity: 0.6;
}

.qa-title {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
</style>
