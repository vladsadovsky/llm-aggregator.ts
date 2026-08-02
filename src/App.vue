<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, onErrorCaptured } from 'vue'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ConfirmDialog from 'primevue/confirmdialog'
import Dialog from 'primevue/dialog'
import ProgressBar from 'primevue/progressbar'
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
import BulkImportDialog from './components/BulkImportDialog.vue'
import DuplicateCleanupDialog from './components/DuplicateCleanupDialog.vue'
import RedundantThreadRepairDialog from './components/RedundantThreadRepairDialog.vue'
import ArchiveResetDialog from './components/ArchiveResetDialog.vue'
import { useThreadStore } from './stores/threadStore'
import { useQAStore } from './stores/qaStore'
import { useUIStore } from './stores/uiStore'
import { useTagStore } from './stores/tagStore'
import { debugError, debugLog } from './utils/logger'
import { commitParsedFileImport } from './utils/fileImportCommit'
import { acceleratorRows, hintFor, styleForPlatform } from '../shared/accelerators'
import type {
  ImportResult,
  SharedImportResult,
  FileImportOutcome,
  BulkImportPreviewSummary,
  BulkImportProgress,
  BulkImportCommitResult,
  BulkImportSelection,
} from './global'

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
const fileImportBusy = ref(false)
// Bulk ("account export") import: preview → commit, with live progress.
const showBulkImport = ref(false)
const bulkImportPreview = ref<BulkImportPreviewSummary | null>(null)
const bulkImportProgress = ref<BulkImportProgress | null>(null)
const bulkImportResult = ref<BulkImportCommitResult | null>(null)
const bulkImportPreparing = ref(false)
const showDuplicates = ref(false)
const showRedundantThreads = ref(false)
const showArchiveReset = ref(false)
let disposeMenuListener: (() => void) | null = null
let disposeProgressListener: (() => void) | null = null

const isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const chordStyle = styleForPlatform(isMacPlatform)
const modKeyLabel = isMacPlatform ? 'Cmd' : 'Ctrl'

/** Shortcut rows for the in-app help dialog, rendered for this platform. */
const shortcutRows = acceleratorRows(chordStyle)

// ─── Central command registry ───────────────────────────────────────────────
// Single source of truth for every end-user action. Both the command palette
// and the native application menu (via the `menu-action` IPC channel) drive
// these. Keyboard shortcuts remain owned by handleGlobalKeydown; the displayed
// hint comes from `shared/accelerators.ts` via `hintFor(id)` — never hardcode a
// shortcut string here, or it will drift from the handler again (issue #8).
interface AppCommand {
  id: string
  label: string
  shortcut: string
  run: () => void
}

/** `shortcut` is looked up, so a command and its hint cannot disagree. */
function cmd(id: string, label: string, run: () => void): AppCommand {
  return { id, label, shortcut: hintFor(id, chordStyle), run }
}

const appCommands: AppCommand[] = [
  cmd('search.focus', 'Focus Search', focusSearch),
  cmd('qa.new', 'New Q&A', openQAEditor),
  cmd('qa.edit', 'Edit Selected Q&A', requestEditSelectedQA),
  cmd('qa.duplicate', 'Duplicate Selected Q&A', requestDuplicateSelectedQA),
  cmd('qa.delete', 'Delete Selected Q&A', requestDeleteSelectedQA),
  cmd('qa.save', 'Save Changes', requestSaveCurrentEdit),
  cmd('qa.moveUp', 'Move Q&A Up in Thread', () => void moveSelectedQA(-1)),
  cmd('qa.moveDown', 'Move Q&A Down in Thread', () => void moveSelectedQA(1)),
  cmd('io.export', 'Export Selected Q&A / Thread', requestExportSelected),
  cmd('io.importFile', 'Import from File', () => void importFile()),
  cmd('io.importSharedLink', 'Import from Shared Link', openSharedLinkImport),
  cmd('thread.new', 'New Thread', requestNewThread),
  cmd('thread.rename', 'Rename Selected Thread', requestRenameSelectedThread),
  cmd('view.showAll', 'Show All Q&As', requestShowAllQAs),
  cmd('view.showUnthreaded', 'Show Unthreaded Q&As', requestShowUnthreaded),
  cmd('view.toggleThreads', 'Toggle Threads Panel', toggleThreadsPanel),
  cmd('view.toggleList', 'Toggle List Panel', toggleListPanel),
  cmd('view.zoomIn', 'Zoom Content In', () => uiStore.zoomIn()),
  cmd('view.zoomOut', 'Zoom Content Out', () => uiStore.zoomOut()),
  cmd('view.zoomReset', 'Reset Content Zoom', () => uiStore.zoomReset()),
  cmd('view.darkMode', 'Toggle Dark Mode', () => uiStore.toggleDarkMode()),
  cmd('view.lens', 'Toggle LLM Lens', () => insightsPanelRef.value?.toggle()),
  cmd('view.status', 'Application Status', () => { showApplicationStatus.value = true }),
  cmd('view.manageTags', 'Manage Tag Dictionary', () => { showTagManager.value = true }),
  cmd('view.generateEmbeddings', 'Generate All Embeddings', () => void generateAllEmbeddings()),
  cmd('view.annotationPass', 'Run Confidence Annotation Pass', () => { showAnnotationDialog.value = true }),
  cmd('view.healthCheck', 'Run Archive Health Check', () => { showHealthDialog.value = true }),
  cmd('tools.findDuplicates', 'Find Duplicate Q&As', () => { showDuplicates.value = true }),
  cmd('tools.findRedundantThreads', 'Find Redundant Threads', () => { showRedundantThreads.value = true }),
  cmd('tools.resetArchive', 'Reset Archive (Clear Everything)', () => { showArchiveReset.value = true }),
  cmd('app.settings', 'Open Settings', openSettings),
  cmd('app.commandPalette', 'Open Command Palette', openCommandPalette),
  cmd('app.shortcuts', 'Keyboard Shortcuts', openShortcutsHelp),
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

onErrorCaptured((err: unknown) => {
  debugError('App', 'Unhandled error:', err)
  toast?.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : String(err), life: 5000 })
  return false
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('llm:import-file', handleImportFileEvent)
  window.removeEventListener('llm:import-shared-link', handleImportSharedLinkEvent)
  disposeMenuListener?.()
  disposeProgressListener?.()
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
  // Re-entrancy guard: the pass can be slow, so ignore repeat invocations from
  // the command palette / menu while one is already running.
  if (generatingEmbeddings.value) return
  generatingEmbeddings.value = true
  toast.add({ severity: 'info', summary: 'Generating embeddings…', detail: 'This may take a moment.', life: 3000 })
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
  if (fileImportBusy.value) return
  fileImportBusy.value = true
  // Let Vue paint the indeterminate state before Electron opens the native
  // chooser and begins potentially expensive archive detection/parsing.
  await nextTick()

  let outcome: FileImportOutcome | null
  try {
    outcome = await window.api.importFromFile()
  } catch (err) {
    // e.g. an unrecognized/unsupported export — surface it instead of failing
    // silently in the console (previously an uncaught promise rejection).
    const detail = err instanceof Error ? err.message : String(err)
    debugError('App', 'importFile failed', err)
    toast?.add({ severity: 'error', summary: 'Import failed', detail, life: 8000 })
    return
  } finally {
    fileImportBusy.value = false
  }
  if (!outcome) return // user cancelled

  // An account export opens the preview dialog instead of importing straight
  // away — it can be hundreds of threads, so the user confirms first.
  if (outcome.kind === 'archive') {
    bulkImportPreview.value = outcome.preview
    bulkImportProgress.value = null
    bulkImportResult.value = null
    showBulkImport.value = true
    return
  }

  const result = outcome.result
  const committed = await commitParsedFileImport(result, {
    createPair: (data) => qaStore.createPair(data),
    createThreadWithItems: (name, ids, options) => threadStore.createThreadWithItems(name, ids, options),
    reload: async () => {
      await qaStore.loadAllPairs()
      await threadStore.loadThreads()
    },
    getThreadItems: (threadId) => threadStore.threads[threadId]?.items,
    onCreateError: (item, err) => {
      debugError('App', 'importFile: createPair failed for item', item.data.title, err)
    },
  })
  const { createdIds, importedThreadId } = committed

  if (importedThreadId) {
    if (!committed.membershipComplete) {
      const detail = 'The Q&As were created, but their thread membership did not persist.'
      debugError('App', 'thread import membership postcondition failed', {
        importedThreadId,
        createdIds,
        persistedItems: threadStore.threads[importedThreadId]?.items ?? [],
      })
      toast?.add({ severity: 'error', summary: 'Thread import incomplete', detail, life: 8000 })
      return
    }
    uiStore.showAllQAs = false
    uiStore.showUnthreaded = false
    uiStore.showGlobalSearchResults = false
    uiStore.globalSearchResultIds = null
    uiStore.searchScope = 'thread'
    threadStore.selectThread(importedThreadId)
    qaStore.selectPair(createdIds[0])
  }

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

async function handleBulkImportCommit(selection: BulkImportSelection) {
  const preview = bulkImportPreview.value
  if (!preview || bulkImportPreparing.value || bulkImportProgress.value) return

  // Do not wait for the first main-process progress packet to show activity or
  // prevent a double-submit: archive indexing can itself take several seconds.
  bulkImportPreparing.value = true
  await nextTick()

  // Subscribe before the call so the first ticks are not missed.
  disposeProgressListener?.()
  disposeProgressListener = window.api.onArchiveImportProgress((progress) => {
    bulkImportProgress.value = progress
  })

  try {
    const result = await window.api.importArchiveCommit(preview.previewId, selection)
    bulkImportResult.value = result
    await qaStore.loadAllPairs()
    await threadStore.loadThreads()
    toast?.add({
      severity: result.failed > 0 ? 'warn' : 'success',
      summary: result.failed > 0 ? 'Import completed with errors' : 'Import complete',
      detail:
        `${result.createdPairs} Q&A${result.createdPairs === 1 ? '' : 's'} in ` +
        `${result.createdThreads} new thread${result.createdThreads === 1 ? '' : 's'}` +
        (result.reusedThreads > 0 ? `, ${result.reusedThreads} existing thread(s) reused` : '') +
        (result.skippedDuplicates > 0 ? `, ${result.skippedDuplicates} duplicate(s) skipped` : ''),
      life: 5000,
    })
  } catch (err) {
    debugError('App', 'bulk import commit failed', err)
    toast?.add({
      severity: 'error',
      summary: 'Import failed',
      detail: err instanceof Error ? err.message : String(err),
      life: 6000,
    })
  } finally {
    bulkImportPreparing.value = false
    disposeProgressListener?.()
    disposeProgressListener = null
    bulkImportProgress.value = null
  }
}

async function handleBulkImportClose() {
  // Release the main-process preview only if the user never committed it.
  const preview = bulkImportPreview.value
  if (preview && !bulkImportResult.value) {
    try {
      await window.api.importArchiveCancel(preview.previewId)
    } catch (err) {
      debugError('App', 'importArchiveCancel failed', err)
    }
  }
  showBulkImport.value = false
  bulkImportPreview.value = null
  bulkImportProgress.value = null
  bulkImportResult.value = null
  bulkImportPreparing.value = false
}

async function handleDuplicatesChanged() {
  await qaStore.loadAllPairs()
  await threadStore.loadThreads()
}

/**
 * After a reset every id in memory is stale, so selections and filters are
 * cleared before reloading — leaving a selected pair id pointing at a deleted
 * file shows an empty content panel with no way back.
 */
async function handleArchiveReset() {
  qaStore.selectedPairId = null
  threadStore.selectedThreadId = null
  threadStore.clearTagFilters()
  uiStore.searchQuery = ''
  await qaStore.loadAllPairs()
  await threadStore.loadThreads()
  await tagStore.reload()
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
      // Date the thread from the conversation itself, not from the import.
      const tid = await threadStore.createThread(result.threadName, { createdAt: result.createdAt })
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
      // Last, so the per-item edits above do not stamp it with the import time.
      await threadStore.setThreadTimes(tid, {
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      })
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

/**
 * The single source of truth for keyboard *behaviour*. Display hints live in
 * `shared/accelerators.ts`; every branch below is tagged with an `// @accel <id>`
 * marker so `tests/unit/accelerators.test.ts` can prove the two agree. Adding a
 * branch without a marker, or a marker without a table row, fails the suite.
 */
function handleGlobalKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const isMod = event.ctrlKey || event.metaKey
  const target = event.target as HTMLElement

  // The three below fire even while a text input holds focus — saving,
  // cancelling, and the palette must work mid-edit. Everything after the
  // isInputTarget gate must not, or typing would trigger actions.

  // @accel qa.save
  if (isMod && key === 's') {
    event.preventDefault()
    requestSaveCurrentEdit()
    return
  }

  // @accel app.escape
  if (event.key === 'Escape') {
    event.preventDefault()
    if (isInputTarget(target)) {
      target.blur()
    }
    closeOverlays()
    return
  }

  // @accel app.commandPalette
  if (isMod && key === 'k') {
    event.preventDefault()
    openCommandPalette()
    return
  }

  if (isInputTarget(target)) return

  // @accel search.focus — Ctrl/Cmd+F, or bare /
  if ((isMod && key === 'f') || (!event.shiftKey && !isMod && !event.altKey && event.key === '/')) {
    event.preventDefault()
    focusSearch()
    return
  }

  // @accel qa.new
  if (isMod && key === 'n') {
    event.preventDefault()
    openQAEditor()
    return
  }

  // @accel app.settings
  if (isMod && event.key === ',') {
    event.preventDefault()
    openSettings()
    return
  }

  // @accel qa.moveUp
  if (event.altKey && !isMod && !event.shiftKey && event.key === 'ArrowUp') {
    event.preventDefault()
    void moveSelectedQA(-1)
    return
  }

  // @accel qa.moveDown
  if (event.altKey && !isMod && !event.shiftKey && event.key === 'ArrowDown') {
    event.preventDefault()
    void moveSelectedQA(1)
    return
  }

  // @accel thread.rename
  if (event.key === 'F2' && !isMod && !event.altKey && !event.shiftKey) {
    event.preventDefault()
    requestRenameSelectedThread()
    return
  }

  // @accel qa.edit
  if (isMod && !event.altKey && !event.shiftKey && key === 'e') {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestEditSelectedQA()
    return
  }

  // @accel qa.delete — Backspace is accepted on every platform, not just macOS
  if ((event.key === 'Delete' || event.key === 'Backspace') && !isMod && !event.altKey && !event.shiftKey) {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestDeleteSelectedQA()
    return
  }

  // @accel qa.duplicate
  if (isMod && !event.altKey && !event.shiftKey && key === 'd') {
    if (!qaStore.selectedPairId || uiStore.isEditing) return
    event.preventDefault()
    requestDuplicateSelectedQA()
    return
  }

  // @accel io.export — QA takes priority, falling back to the selected thread.
  // Was a bare `X`; the shifted form cannot be typed into content by accident
  // and pairs with Ctrl/Cmd+E edit.
  if (isMod && event.shiftKey && !event.altKey && key === 'e') {
    if (uiStore.isEditing) return
    if (qaStore.selectedPairId || threadStore.selectedThreadId) {
      event.preventDefault()
      requestExportSelected()
    }
    return
  }

  // @accel io.importSharedLink
  if (isMod && event.shiftKey && key === 'o') {
    event.preventDefault()
    openSharedLinkImport()
    return
  }

  // @accel io.importFile
  if (isMod && !event.shiftKey && key === 'o') {
    event.preventDefault()
    void importFile()
    return
  }

  // @accel app.shortcuts — `?` is Shift+/ on most layouts, so shift is not
  // excluded here; Ctrl and Alt are.
  if (event.key === '?' && !isMod && !event.altKey) {
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
      <!-- Rows come from shared/accelerators.ts so this list cannot drift from
           the handler, the menu, or the README (issue #8). -->
      <table>
        <tbody>
          <tr
            v-for="row in shortcutRows"
            :key="row.keys + row.description"
          >
            <td>{{ row.keys }}</td>
            <td>{{ row.description }}</td>
            <td class="shortcut-context">
              {{ row.context }}
            </td>
          </tr>
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

  <!-- Immediate feedback while the native chooser and preview parser are active. -->
  <Dialog
    :visible="fileImportBusy"
    header="Import from File"
    :modal="true"
    :closable="false"
    :close-on-escape="false"
    :style="{ width: '460px', maxWidth: '90vw' }"
    data-testid="file-import-busy-dialog"
  >
    <p>Opening and analyzing the selected file… Large archives may take a while.</p>
    <ProgressBar mode="indeterminate" />
  </Dialog>

  <!-- Account-export (bulk) import: preview, progress, summary -->
  <BulkImportDialog
    v-model:visible="showBulkImport"
    :preview="bulkImportPreview"
    :progress="bulkImportProgress"
    :result="bulkImportResult"
    :preparing="bulkImportPreparing"
    @commit="handleBulkImportCommit"
    @close="handleBulkImportClose"
  />

  <!-- Archive-wide duplicate cleanup (Tools) -->
  <DuplicateCleanupDialog
    v-model:visible="showDuplicates"
    @changed="handleDuplicatesChanged"
  />

  <!-- Redundant thread wrapper repair (Tools) -->
  <RedundantThreadRepairDialog
    v-model:visible="showRedundantThreads"
    @changed="() => toast.add({ severity: 'success', summary: 'Redundant threads merged', life: 3000 })"
  />

  <!-- Reset the archive to a clean state (Tools) -->
  <ArchiveResetDialog
    v-model:visible="showArchiveReset"
    @reset="handleArchiveReset"
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
  width: 32%;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

/* Third column: where the binding is live, e.g. "Q&A selected". */
.shortcuts-dialog .shortcut-context {
  width: 24%;
  text-align: right;
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
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
