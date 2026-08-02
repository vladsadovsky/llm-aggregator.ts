import { dialog, BrowserWindow, shell } from 'electron'
import { isExternallyOpenable } from '../security/navigationPolicy'
import { loadThreads, saveThreads } from '../services/threadService'
import {
  listAllPairs,
  getPair,
  createPair,
  updatePair,
  deletePair,
} from '../services/qaPairService'
import { search } from '../services/searchService'
import { loadSettings, saveSettings } from '../services/settingsService'
import { notifySettingsChanged } from '../services/settingsEvents'
import { exportQAToFile, exportThreadToFile } from '../services/fileExportService'
import { importFromFile } from '../services/fileImportService'
import {
  commitArchiveImport,
  beginCommit,
  cancelCommit,
  releasePreview,
} from '../services/import/archive/bulkImportService'
import { findDuplicateGroups, deleteDuplicates } from '../services/duplicateService'
import { repairRedundantThreadGroups } from '../services/redundantThreadRepairService'
import { deleteThreadsWithContents, previewThreadDeletion } from '../services/threadDeletionService'
import { previewArchiveReset, resetArchive } from '../services/archiveResetService'
import { importSharedLink } from '../services/import/sharedLinkImportService'
import {
  devEnvSecretVarNames,
  getSecretsStatus,
  loadSecrets,
  recheckSecretsStorage,
  saveSecrets,
} from '../services/secretsService'
import { generateMetadata } from '../services/metadataService'
import { generateEmbedding, generateAllEmbeddings, semanticSearch } from '../services/embeddingService'
import { getProvider } from '../services/llm/providerFactory'
import { getTokenStats, resetTokenStats } from '../services/llm/tokenTracker'
import { listLlmProviders, listProviderModels } from '../services/llm/modelCatalogService'
import { sessionBriefing, priorArtCheck, steelmanRetrieval, questionSeeding, conceptStateSummary } from '../services/insightsService'
import { generateAnnotations, applyAnnotations } from '../services/annotationService'
import { runHealthCheck } from '../services/healthService'
import {
  loadDictionary,
  saveDictionary,
  addTag,
  removeTag,
  renameTag,
  addAlias,
  removeAlias,
  resolveTag,
  syncFromArchive,
  invalidateCache as invalidateTagCache,
} from '../services/tagDictionaryService'
import { CH, EVENT_CH } from '../../shared/contracts'
import { createRegistrar } from './registerValidatedHandler'
import type { SenderPolicy } from './senderPolicy'

/**
 * Register every privileged channel through the validated registrar. `policy`
 * supplies the trusted main-window webContents and allowed origins so a call
 * from any other frame is rejected before it reaches a service.
 */
export function registerIpcHandlers(policy: SenderPolicy): void {
  const r = createRegistrar(policy)

  // ─── Shell ─────────────────────────────────────────────────
  // Open a rendered-content link in the system browser (SEC-01). Only a parsed
  // https:/mailto: URL is passed to the OS — never the raw string.
  r.handle(CH.openExternal, async (_event, url): Promise<{ ok: boolean }> => {
    if (isExternallyOpenable(url)) {
      await shell.openExternal(new URL(url).href)
      return { ok: true }
    }
    return { ok: false }
  })

  // ─── Settings ──────────────────────────────────────────────
  r.handle(CH.settingsLoad, () => loadSettings())

  r.handle(CH.settingsSave, (_event, settings) => {
    saveSettings(settings)
    notifySettingsChanged(settings)
    // Data directory may have changed — drop the tag dictionary cache.
    invalidateTagCache()
  })

  r.handle(CH.settingsPickDirectory, async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Data Directory',
      message: 'Choose the folder containing your archive/ and threads.json',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ─── Threads ───────────────────────────────────────────────
  r.handle(CH.threadsLoad, () => loadThreads())
  r.handle(CH.threadsSave, (_event, threads) => saveThreads(threads))
  r.handle(CH.threadsRepairRedundant, (_event, requests) => repairRedundantThreadGroups(requests))
  r.handle(CH.threadsDeletePreview, (_event, threadIds) => previewThreadDeletion(threadIds))
  r.handle(CH.threadsDeleteApply, (_event, threadIds, token) => deleteThreadsWithContents(threadIds, token))

  // ─── QA Pairs ──────────────────────────────────────────────
  r.handle(CH.qaListAll, () => listAllPairs())
  r.handle(CH.qaGet, (_event, id) => getPair(id))
  r.handle(CH.qaCreate, (_event, data) => createPair(data))
  r.handle(CH.qaUpdate, (_event, id, data) => updatePair(id, data))
  r.handle(CH.qaDelete, (_event, id) => deletePair(id))

  // ─── Search ────────────────────────────────────────────────
  r.handle(CH.searchQuery, (_event, query, type) => search(query, type))
  r.handle(CH.searchSemantic, (_event, query, topK) => semanticSearch(query, topK))

  // ─── Export / Import ───────────────────────────────────────
  r.handle(CH.exportQa, (event, id) => {
    const pair = getPair(id)
    if (!pair) return null
    return exportQAToFile(pair, BrowserWindow.fromWebContents(event.sender))
  })

  r.handle(CH.exportThread, (event, threadId) => {
    const threads = loadThreads()
    const thread = threads[threadId]
    if (!thread) return null
    const pairs = listAllPairs()
    return exportThreadToFile(thread, pairs, BrowserWindow.fromWebContents(event.sender))
  })

  r.handle(CH.importFile, (event) => importFromFile(BrowserWindow.fromWebContents(event.sender)))
  r.handle(CH.importSharedLink, (_event, url) => importSharedLink(url))

  // ─── Bulk (account export) import ───────────────────────────
  r.handle(CH.importArchiveCommit, async (event, previewId, selection) => {
    // Claims the preview or throws a coded error on a missing/double commit, and
    // yields the abort signal cancellation drives.
    const { preview, signal } = beginCommit(previewId)
    try {
      // Progress is pushed to the window that asked for the import; the renderer
      // never polls.
      return await commitArchiveImport(
        preview,
        selection,
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(EVENT_CH.archiveImportProgress, progress)
          }
        },
        signal,
      )
    } finally {
      releasePreview(previewId)
    }
  })

  r.handle(CH.importArchiveCancel, (_event, previewId) => {
    // Abort an in-flight commit (or drop an uncommitted preview).
    cancelCommit(previewId)
  })

  // ─── Duplicate cleanup ──────────────────────────────────────
  r.handle(CH.duplicatesScan, () => findDuplicateGroups())
  r.handle(CH.duplicatesDelete, (_event, requests) => deleteDuplicates(requests))

  // ─── Archive reset ──────────────────────────────────────────
  r.handle(CH.archiveResetPreview, () => previewArchiveReset())
  r.handle(CH.archiveReset, () => resetArchive())

  // ─── Secrets ───────────────────────────────────────────────
  // Raw key values never cross to the renderer. `secrets:load` returns presence,
  // a masked preview, and provenance only.
  r.handle(CH.secretsLoad, () => getSecretsStatus())
  r.handle(CH.secretsSave, (_event, updates) => {
    // Partial update: only the fields the user edited; omitted keys keep their value.
    saveSecrets(updates ?? {})
    return getSecretsStatus()
  })
  r.handle(CH.secretsRecheck, () => recheckSecretsStorage())
  r.handle(CH.secretsDevEnvVarNames, () => devEnvSecretVarNames())

  // ─── AI / LLM ──────────────────────────────────────────────
  r.handle(CH.aiGenerateMetadata, (_event, id) => generateMetadata(id))
  r.handle(CH.aiGenerateEmbedding, (_event, id) => generateEmbedding(id))
  r.handle(CH.aiGenerateAllEmbeddings, () => generateAllEmbeddings())

  r.handle(CH.aiTestConnection, async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const provider = getProvider()
      await provider.testConnection()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  r.handle(CH.aiListProviders, () => listLlmProviders())
  r.handle(CH.aiListModels, (_event, providerId, forceRefresh, apiKeyOverride) => {
    // `apiKeyOverride` only ever carries a key the user has just typed into the
    // Settings field, so discovery works before Save. When the field is
    // untouched the renderer sends nothing and the key is resolved here.
    const secrets = loadSecrets()
    return listProviderModels(providerId, secrets, Boolean(forceRefresh), { apiKeyOverride })
  })

  r.handle(CH.aiSessionBrief, (_event, topic) => sessionBriefing(topic))
  r.handle(CH.aiPriorArt, (_event, query) => priorArtCheck(query))
  r.handle(CH.aiSteelman, (_event, hypothesis) => steelmanRetrieval(hypothesis))
  r.handle(CH.aiQuestionSeed, (_event, topic) => questionSeeding(topic))
  r.handle(CH.aiConceptSummary, (_event, concept) => conceptStateSummary(concept))
  r.handle(CH.aiGetTokenStats, () => getTokenStats())
  r.handle(CH.aiResetTokenStats, () => resetTokenStats())
  r.handle(CH.aiGenerateAnnotations, (_event, ids) => generateAnnotations(ids))
  r.handle(CH.aiApplyAnnotations, (_event, approved) => applyAnnotations(approved))

  // ─── Archive Health ─────────────────────────────────────────
  r.handle(CH.archiveHealthCheck, () => runHealthCheck())

  // ─── Tag Dictionary ─────────────────────────────────────────
  r.handle(CH.tagsLoad, () => loadDictionary())
  r.handle(CH.tagsSave, (_event, dict) => saveDictionary(dict))
  r.handle(CH.tagsAdd, (_event, tag, aliases) => addTag(tag, aliases))
  r.handle(CH.tagsRemove, (_event, tag) => removeTag(tag))
  r.handle(CH.tagsRename, (_event, oldTag, newTag) => renameTag(oldTag, newTag))
  r.handle(CH.tagsAddAlias, (_event, tag, alias) => addAlias(tag, alias))
  r.handle(CH.tagsRemoveAlias, (_event, tag, alias) => removeAlias(tag, alias))
  r.handle(CH.tagsResolve, (_event, input) => resolveTag(input))
  r.handle(CH.tagsSync, () => syncFromArchive())
}
