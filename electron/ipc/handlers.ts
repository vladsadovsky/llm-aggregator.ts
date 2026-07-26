import { ipcMain, dialog, BrowserWindow } from 'electron'
import { loadThreads, saveThreads, ThreadMap } from '../services/threadService'
import {
  listAllPairs,
  getPair,
  createPair,
  updatePair,
  deletePair,
  QACreateData,
  QAUpdateData,
} from '../services/qaPairService'
import { search } from '../services/searchService'
import { loadSettings, saveSettings, AppSettings } from '../services/settingsService'
import { notifySettingsChanged } from '../services/settingsEvents'
import { exportQAToFile, exportThreadToFile } from '../services/fileExportService'
import { importFromFile } from '../services/fileImportService'
import type { ImportResult } from '../services/qaImportFormatService'
import { importSharedLink } from '../services/import/sharedLinkImportService'
import type { SharedImportResult } from '../services/import/types'
import {
  devEnvSecretVarNames,
  getSecretsStatus,
  loadSecrets,
  recheckSecretsStorage,
  saveSecrets,
  type AppSecrets,
  type SecretsStatus,
} from '../services/secretsService'
import { generateMetadata } from '../services/metadataService'
import { generateEmbedding, generateAllEmbeddings, semanticSearch } from '../services/embeddingService'
import { getProvider } from '../services/llm/providerFactory'
import { getTokenStats, resetTokenStats, TokenStats } from '../services/llm/tokenTracker'
import { listLlmProviders, listProviderModels } from '../services/llm/modelCatalogService'
import { sessionBriefing, priorArtCheck, steelmanRetrieval, questionSeeding, conceptStateSummary } from '../services/insightsService'
import { generateAnnotations, applyAnnotations } from '../services/annotationService'
import type { AnnotationProposal, ConfidenceLevel } from '../services/annotationService'
import { runHealthCheck } from '../services/healthService'
import type { HealthReport } from '../services/healthService'
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
import type { TagDictionary } from '../services/tagDictionaryService'

export function registerIpcHandlers(): void {
  // ─── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', async (): Promise<AppSettings> => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings): Promise<void> => {
    saveSettings(settings)
    notifySettingsChanged(settings)
    // Data directory may have changed — drop the tag dictionary cache
    invalidateTagCache()
  })

  ipcMain.handle('settings:pickDirectory', async (): Promise<string | null> => {
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
  ipcMain.handle('threads:load', async (): Promise<ThreadMap> => {
    return loadThreads()
  })

  ipcMain.handle('threads:save', async (_event, threads: ThreadMap): Promise<void> => {
    saveThreads(threads)
  })

  // ─── QA Pairs ──────────────────────────────────────────────
  ipcMain.handle('qa:listAll', async () => {
    return listAllPairs()
  })

  ipcMain.handle('qa:get', async (_event, id: string) => {
    return getPair(id)
  })

  ipcMain.handle('qa:create', async (_event, data: QACreateData) => {
    return createPair(data)
  })

  ipcMain.handle('qa:update', async (_event, id: string, data: QAUpdateData) => {
    return updatePair(id, data)
  })

  ipcMain.handle('qa:delete', async (_event, id: string) => {
    return deletePair(id)
  })

  // ─── Search ────────────────────────────────────────────────
  ipcMain.handle('search:query', async (_event, query: string, type: 'full-text' | 'tags') => {
    return search(query, type)
  })

  // ─── Export / Import ───────────────────────────────────────
  ipcMain.handle('export:qa', async (_event, id: string) => {
    const pair = getPair(id)
    if (!pair) return null
    return exportQAToFile(pair)
  })

  ipcMain.handle('export:thread', async (_event, threadId: string) => {
    const threads = loadThreads()
    const thread = threads[threadId]
    if (!thread) return null
    const pairs = listAllPairs()
    return exportThreadToFile(thread, pairs)
  })

  ipcMain.handle('import:file', async (): Promise<ImportResult | null> => {
    return importFromFile()
  })

  ipcMain.handle('import:sharedLink', async (_event, url: string): Promise<SharedImportResult> => {
    return importSharedLink(url)
  })

  // ─── Semantic Search ────────────────────────────────────────
  ipcMain.handle('search:semantic', async (_event, query: string, topK: number) => {
    return semanticSearch(query, topK)
  })

  // ─── Secrets ───────────────────────────────────────────────
  // Raw key values never cross to the renderer. `secrets:load` returns presence,
  // a masked preview, and provenance only.
  ipcMain.handle('secrets:load', async (): Promise<SecretsStatus> => {
    return getSecretsStatus()
  })

  // Accepts a partial update: only the fields the user actually edited. Omitted
  // keys keep their stored value.
  ipcMain.handle('secrets:save', async (_event, updates: Partial<AppSecrets>): Promise<SecretsStatus> => {
    saveSecrets(updates ?? {})
    return getSecretsStatus()
  })

  ipcMain.handle('secrets:recheck', async (): Promise<SecretsStatus> => {
    return recheckSecretsStorage()
  })

  ipcMain.handle('secrets:devEnvVarNames', async (): Promise<string[]> => {
    return devEnvSecretVarNames()
  })

  // ─── AI / LLM ──────────────────────────────────────────────
  ipcMain.handle('ai:generateMetadata', async (_event, id: string) => {
    return generateMetadata(id)
  })

  ipcMain.handle('ai:generateEmbedding', async (_event, id: string) => {
    return generateEmbedding(id)
  })

  ipcMain.handle('ai:generateAllEmbeddings', async () => {
    return generateAllEmbeddings()
  })

  ipcMain.handle('ai:testConnection', async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const provider = getProvider()
      await provider.testConnection()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ai:listProviders', async () => {
    return listLlmProviders()
  })

  ipcMain.handle(
    'ai:listModels',
    async (_event, providerId: string, forceRefresh?: boolean, apiKeyOverride?: string) => {
      // `apiKeyOverride` only ever carries a key the user has just typed into the
      // Settings field, so discovery works before Save. When the field is
      // untouched the renderer sends nothing and the key is resolved here.
      const secrets = loadSecrets()
      return listProviderModels(providerId, secrets, Boolean(forceRefresh), { apiKeyOverride })
    },
  )

  ipcMain.handle('ai:sessionBrief', async (_event, topic: string): Promise<string> => {
    return sessionBriefing(topic)
  })

  ipcMain.handle('ai:priorArt', async (_event, query: string): Promise<string> => {
    return priorArtCheck(query)
  })

  ipcMain.handle('ai:steelman', async (_event, hypothesis: string): Promise<string> => {
    return steelmanRetrieval(hypothesis)
  })

  ipcMain.handle('ai:questionSeed', async (_event, topic: string): Promise<string> => {
    return questionSeeding(topic)
  })

  ipcMain.handle('ai:conceptSummary', async (_event, concept: string): Promise<string> => {
    return conceptStateSummary(concept)
  })

  ipcMain.handle('ai:getTokenStats', async (): Promise<TokenStats> => {
    return getTokenStats()
  })

  ipcMain.handle('ai:resetTokenStats', async (): Promise<void> => {
    resetTokenStats()
  })

  ipcMain.handle('ai:generateAnnotations', async (_event, ids?: string[]): Promise<AnnotationProposal[]> => {
    return generateAnnotations(ids)
  })

  ipcMain.handle('ai:applyAnnotations', async (_event, approved: Array<{ id: string; confidence: ConfidenceLevel }>): Promise<void> => {
    return applyAnnotations(approved)
  })

  // ─── Archive Health ─────────────────────────────────────────
  ipcMain.handle('archive:healthCheck', async (): Promise<HealthReport> => {
    return runHealthCheck()
  })

  // ─── Tag Dictionary ─────────────────────────────────────────
  ipcMain.handle('tags:load', async (): Promise<TagDictionary> => {
    return loadDictionary()
  })

  ipcMain.handle('tags:save', async (_event, dict: TagDictionary): Promise<void> => {
    saveDictionary(dict)
  })

  ipcMain.handle('tags:add', async (_event, tag: string, aliases?: string[]): Promise<void> => {
    addTag(tag, aliases)
  })

  ipcMain.handle('tags:remove', async (_event, tag: string): Promise<void> => {
    removeTag(tag)
  })

  ipcMain.handle('tags:rename', async (_event, oldTag: string, newTag: string): Promise<void> => {
    renameTag(oldTag, newTag)
  })

  ipcMain.handle('tags:addAlias', async (_event, tag: string, alias: string): Promise<void> => {
    addAlias(tag, alias)
  })

  ipcMain.handle('tags:removeAlias', async (_event, tag: string, alias: string): Promise<void> => {
    removeAlias(tag, alias)
  })

  ipcMain.handle('tags:resolve', async (_event, input: string): Promise<string | null> => {
    return resolveTag(input)
  })

  ipcMain.handle('tags:sync', async (): Promise<{ added: string[] }> => {
    return syncFromArchive()
  })
}
