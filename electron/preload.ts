import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, EVENT_CH } from '../shared/contracts/channels'
import { extractWireError } from '../shared/contracts/errorWire'
import type { BulkImportSelectionContract } from '../shared/contracts/import'

/**
 * Recover a clean Error from a serialized IPC rejection. Main encodes coded
 * errors as `IPCERR:<code>:<message>`; we surface the human message and attach
 * `.code` so callers can branch, without ever exposing a main-process stack.
 */
function rethrowIpcError(err: unknown): never {
  const raw = err instanceof Error ? err.message : String(err)
  const decoded = extractWireError(raw)
  if (decoded) {
    const clean = new Error(decoded.message) as Error & { code?: string }
    clean.code = decoded.code
    throw clean
  }
  throw err instanceof Error ? err : new Error(raw)
}

/** Invoke a channel, normalizing any rejection to a clean coded Error. */
function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).catch(rethrowIpcError) as Promise<T>
}

export interface AppSettings {
  dataDirectory: string
  llmProvider: string
  llmModel: string
  lensEnabled: boolean
  tagEnforcement: 'off' | 'warn' | 'strict'
  tagSoftLimit: number
  tagHardLimit: number
  allowDevEnvSecrets: boolean
  experimentalFeatures?: Record<string, boolean>
}

export interface AppSecrets {
  openaiApiKey: string
  anthropicApiKey: string
}

export type SecretKey = keyof AppSecrets
export type SecretSource = 'env' | 'safe-storage' | 'none'
export type SecretBackendId = Exclude<SecretSource, 'none'>

export type SecretErrorCode =
  | 'ENV_DISABLED'
  | 'ENV_IGNORED_PACKAGED'
  | 'ENV_MALFORMED'
  | 'SAFE_STORAGE_UNAVAILABLE'
  | 'SAFE_STORAGE_READ_FAIL'
  | 'SAFE_STORAGE_DECRYPT_FAIL'
  | 'SAFE_STORAGE_WRITE_FAIL'
  | 'LEGACY_FILE_ORPHANED'
  | 'NO_SECRET_AVAILABLE'

export interface SecretWarning {
  code: SecretErrorCode
  message: string
}

export interface SecretKeyStatus {
  hasKey: boolean
  maskedPreview: string
  source: SecretSource
  readOnly: boolean
}

/** Non-secret view of secret storage. Raw key values never reach the renderer. */
export interface SecretsStatus {
  keys: Record<SecretKey, SecretKeyStatus>
  warnings: SecretWarning[]
  backends: Array<{ id: SecretBackendId; available: boolean; writable: boolean }>
}

export type ModelTier = 'budget' | 'balanced' | 'premium' | 'unknown'
export type LatencyTier = 'fast' | 'medium' | 'slow' | 'unknown'

export interface ProviderCapabilities {
  complete: boolean
  embed: boolean
  streaming: boolean
  local: boolean
}

export interface ProviderDescriptor {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'openai-compatible'
  enabled: boolean
  comingSoon?: boolean
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey'
  supportsModelDiscovery: boolean
  /** Declared capabilities — the UI selects features by these, not provider name. */
  capabilities?: ProviderCapabilities
  notes?: string
}

export interface ModelDescriptor {
  id: string
  label: string
  providerId: string
  qualityTier: ModelTier
  costTier: ModelTier
  latencyTier: LatencyTier
  recommendedFor: string[]
  notes?: string
  rank?: number
}

export interface ModelCatalogResult {
  providerId: string
  source: 'api' | 'cache' | 'static'
  fetchedAt: string
  warning?: string
  models: ModelDescriptor[]
}

export interface TagEntry {
  created: string
  aliases: string[]
}

export interface TagDictionary {
  version: number
  tags: Record<string, TagEntry>
}

export interface ImportedQA {
  data: QACreateData
  warnings: string[]
  originalId: string
  originalTimestamp: string
}

export interface ImportResult {
  exportType: 'qa' | 'thread' | 'unknown'
  threadName?: string
  threadTags?: string[]
  items: ImportedQA[]
  fileWarnings: string[]
}

export interface ExportResult {
  savedPath: string
}

export type ProviderId = 'chatgpt' | 'gemini' | 'copilot' | 'claude'

export interface SharedImportQA {
  data: QACreateData
  warnings: string[]
  originId?: string
}

// ─── Bulk (account export) import ────────────────────────────────────────────

export type ArchiveFormatId =
  | 'claude-account-export'
  | 'chatgpt-account-export'
  | 'gemini-takeout'
  | 'copilot-activity-csv'

export interface BulkImportThreadSummary {
  sourceId: string
  name: string
  nameWasDerived: boolean
  tags: string[]
  pairCount: number
  duplicateCount: number
  createdAt: string
  updatedAt: string
  warnings: string[]
}

export interface BulkImportPreviewSummary {
  previewId: string
  format: ArchiveFormatId
  formatLabel: string
  provider: ProviderId
  sourcePath: string
  sourceEntry: string
  threads: BulkImportThreadSummary[]
  totalPairs: number
  duplicatePairs: number
  dateRange: { from: string; to: string }
  warnings: string[]
}

/** Type-only import keeps zod out of the sandboxed preload bundle. */
export type BulkImportSelection = BulkImportSelectionContract

export interface BulkImportProgress {
  processed: number
  total: number
  percent: number
  etaSeconds: number | null
  currentThreadName: string
  currentItemTitle: string
  threadsDone: number
  threadsTotal: number
}

export interface BulkImportCommitResult {
  createdPairs: number
  skippedDuplicates: number
  createdThreads: number
  reusedThreads: number
  failed: number
  threadNames: string[]
  warnings: string[]
  /** True when the commit stopped early on user cancellation. */
  cancelled: boolean
}

/** Import from file resolves to one of two pipelines — see fileImportService. */
export type FileImportOutcome =
  | { kind: 'markdown'; result: ImportResult }
  | { kind: 'archive'; preview: BulkImportPreviewSummary }

// ─── Duplicate cleanup ───────────────────────────────────────────────────────

export type DuplicateMatchKind = 'origin-id' | 'content'

export interface DuplicateMember {
  id: string
  title: string
  source: string
  timestamp: string
  threadCount: number
  keep: boolean
}

export interface DuplicateGroup {
  key: string
  matchKind: DuplicateMatchKind
  members: DuplicateMember[]
}

export interface DuplicateScanResult {
  scanned: number
  groups: DuplicateGroup[]
  removableCount: number
}

export interface DuplicateCleanupResult {
  deleted: string[]
  failed: Array<{ id: string; error: string }>
  threadsUpdated: number
}

export interface DuplicateCleanupRequest {
  key: string
  matchKind: DuplicateMatchKind
  keepId: string
  removeIds: string[]
}

export interface RedundantThreadRepairRequest {
  itemIds: string[]
  survivorId: string
  redundantIds: string[]
}

export interface RedundantThreadRepairResult {
  threads: Record<string, { name: string; items: string[]; tags?: string[]; createdAt?: string; updatedAt?: string; importSourceId?: string }>
  mergedGroups: number
  removedThreadIds: string[]
}

export interface ThreadDeletionPreview {
  token: string
  threadIds: string[]
  qaIdsToDelete: string[]
  sharedQaIds: string[]
  sharedThreadIds: string[]
}

export interface ThreadDeletionResult extends ThreadDeletionPreview {
  threads: Record<string, { name: string; items: string[]; tags?: string[]; createdAt?: string; updatedAt?: string; importSourceId?: string }>
  cleanupPending: boolean
}

// ─── Archive reset ───────────────────────────────────────────────────────────

export interface ArchiveResetPreview {
  pairs: number
  threads: number
  tags: number
  hasEmbeddings: boolean
  dataDirectory: string
}

export interface ArchiveResetResult {
  pairsRemoved: number
  threadsRemoved: number
  tagsRemoved: number
  embeddingsRemoved: boolean
  /** Folder everything was moved into — nothing is deleted outright. */
  backupPath: string
  warnings: string[]
}

export interface SharedImportResult {
  provider: ProviderId
  url: string
  model: string
  threadName: string
  titleWasDerived: boolean
  tags: string[]
  items: SharedImportQA[]
  warnings: string[]
  /** Earliest message time in the conversation (ISO), '' when unknown. */
  createdAt: string
  /** Latest message time in the conversation (ISO), '' when unknown. */
  updatedAt: string
}

export interface ElectronAPI {
  // Settings
  settingsLoad: () => Promise<AppSettings>
  settingsSave: (settings: AppSettings) => Promise<void>
  settingsPickDirectory: () => Promise<string | null>

  // Secrets — write-only. Reads return status/metadata, never key values.
  secretsLoad: () => Promise<SecretsStatus>
  /** Send only the keys the user edited; omitted keys keep their stored value. */
  secretsSave: (updates: Partial<AppSecrets>) => Promise<SecretsStatus>
  secretsRecheck: () => Promise<SecretsStatus>
  secretsDevEnvVarNames: () => Promise<string[]>

  // Threads
  threadsLoad: () => Promise<Record<string, { name: string; items: string[]; importSourceId?: string }>>
  threadsSave: (threads: Record<string, { name: string; items: string[]; importSourceId?: string }>) => Promise<void>
  threadsRepairRedundant: (requests: RedundantThreadRepairRequest[]) => Promise<RedundantThreadRepairResult>
  threadsDeletePreview: (threadIds: string[]) => Promise<ThreadDeletionPreview>
  threadsDeleteApply: (threadIds: string[], token: string) => Promise<ThreadDeletionResult>

  // QA Pairs
  qaListAll: () => Promise<Record<string, QAPairData>>
  qaGet: (id: string) => Promise<QAPairData | null>
  qaCreate: (data: QACreateData) => Promise<QAPairData>
  qaUpdate: (id: string, data: QAUpdateData) => Promise<QAPairData>
  qaDelete: (id: string) => Promise<void>

  // Search
  searchQuery: (query: string, type: 'full-text' | 'tags') => Promise<string[]>
  searchSemantic: (query: string, topK: number) => Promise<string[]>

  // AI
  aiGenerateMetadata: (id: string) => Promise<QAPairData | null>
  aiGenerateEmbedding: (id: string) => Promise<void>
  aiGenerateAllEmbeddings: () => Promise<{ total: number; generated: number; skipped: number }>
  aiTestConnection: () => Promise<{ ok: boolean; error?: string }>
  aiListProviders: () => Promise<ProviderDescriptor[]>
  /** `apiKeyOverride` carries only a just-typed, unsaved key for the queried provider. */
  aiListModels: (
    providerId: string,
    forceRefresh?: boolean,
    apiKeyOverride?: string,
  ) => Promise<ModelCatalogResult>
  aiSessionBrief: (topic: string) => Promise<string>
  aiPriorArt: (query: string) => Promise<string>
  aiGetTokenStats: () => Promise<{ llm: { input: number; output: number }; embeddings: { input: number } }>
  aiResetTokenStats: () => Promise<void>
  aiSteelman: (hypothesis: string) => Promise<string>
  aiQuestionSeed: (topic: string) => Promise<string>
  aiConceptSummary: (concept: string) => Promise<string>
  aiGenerateAnnotations: (ids?: string[]) => Promise<AnnotationProposal[]>
  aiApplyAnnotations: (approved: Array<{ id: string; confidence: ConfidenceLevel }>) => Promise<void>

  // Archive Health
  archiveHealthCheck: () => Promise<HealthReport>

  // Tag Dictionary
  tagsLoad: () => Promise<TagDictionary>
  tagsSave: (dict: TagDictionary) => Promise<void>
  tagsAdd: (tag: string, aliases?: string[]) => Promise<void>
  tagsRemove: (tag: string) => Promise<void>
  tagsRename: (oldTag: string, newTag: string) => Promise<void>
  tagsAddAlias: (tag: string, alias: string) => Promise<void>
  tagsRemoveAlias: (tag: string, alias: string) => Promise<void>
  tagsResolve: (input: string) => Promise<string | null>
  tagsSync: () => Promise<{ added: string[] }>

  // Export / Import
  exportQA: (id: string) => Promise<ExportResult | null>
  exportThread: (threadId: string) => Promise<ExportResult | null>
  importFromFile: () => Promise<FileImportOutcome | null>
  importSharedLink: (url: string) => Promise<SharedImportResult>
  /** Write the selected conversations from a previewed account export. */
  importArchiveCommit: (
    previewId: string,
    selection: BulkImportSelection,
  ) => Promise<BulkImportCommitResult>
  /** Drop a preview the user backed out of, freeing its memory in main. */
  importArchiveCancel: (previewId: string) => Promise<void>
  /** Subscribe to bulk-import progress. Returns an unsubscribe function. */
  onArchiveImportProgress: (callback: (progress: BulkImportProgress) => void) => () => void

  // Duplicate cleanup
  duplicatesScan: () => Promise<DuplicateScanResult>
  duplicatesDelete: (requests: DuplicateCleanupRequest[]) => Promise<DuplicateCleanupResult>
  /** Counts of what a reset would clear — read-only. */
  archiveResetPreview: () => Promise<ArchiveResetPreview>
  /** Move the archive, threads, tags and embeddings aside; returns the backup path. */
  archiveReset: () => Promise<ArchiveResetResult>

  // Open a rendered-content link in the system browser. Resolves { ok:false }
  // when the URL is not an accepted https:/mailto: link.
  openExternal: (url: string) => Promise<{ ok: boolean }>

  // Native application menu → renderer. Returns an unsubscribe function.
  onMenuAction: (callback: (action: string) => void) => () => void
}

export interface QAPairData {
  id: string
  filepath: string
  title: string
  source: string
  url: string
  tags: string[]
  timestamp: string
  version: number
  threadPairs: Array<{ thread_id: string; order: number }>
  question: string
  answer: string
  aiTopic?: string
  aiConcepts?: string[]
  aiStatus?: 'open' | 'closed' | 'speculative' | 'dead-end'
  aiConfidence?: 'speculative' | 'working' | 'confident' | 'validated'
  aiSummary?: string
  aiRelatedIds?: string[]
}

export interface QACreateData {
  title: string
  source: string
  url: string
  tags: string[]
  question: string
  answer: string
  /** Provider-side identity (`<provider>:<conversationId>:<messageId>`). Importers only. */
  originId?: string
  /** Provider-side creation time (ISO); drives both the stored timestamp and the id. */
  timestamp?: string
}

export interface QAUpdateData {
  title?: string
  source?: string
  url?: string
  tags?: string[]
  question?: string
  answer?: string
  aiTopic?: string
  aiConcepts?: string[]
  aiStatus?: 'open' | 'closed' | 'speculative' | 'dead-end'
  aiConfidence?: 'speculative' | 'working' | 'confident' | 'validated'
  aiSummary?: string
  aiRelatedIds?: string[]
}

export type ConfidenceLevel = 'speculative' | 'working' | 'confident' | 'validated'

export interface AnnotationProposal {
  id: string
  title: string
  currentConfidence: ConfidenceLevel | undefined
  proposedConfidence: ConfidenceLevel
  rationale: string
}

export interface DuplicateCandidate {
  idA: string
  titleA: string
  idB: string
  titleB: string
  similarity: number
}

export interface DeadEndEntry {
  id: string
  title: string
  status: string
  ageMonths: number
}

export interface HealthReport {
  totalPairs: number
  orphanIds: string[]
  metadataGaps: {
    missingTopic: string[]
    missingSummary: string[]
    missingConfidence: string[]
  }
  duplicateCandidates: DuplicateCandidate[]
  deadEndCandidates: DeadEndEntry[]
}


/** Structural guard for an inbound bulk-import progress payload. */
function isProgress(p: unknown): p is BulkImportProgress {
  if (typeof p !== 'object' || p === null) return false
  const o = p as Record<string, unknown>
  return typeof o.processed === 'number' && typeof o.total === 'number'
}

const api: ElectronAPI = {
  // Settings
  settingsLoad: () => call(CH.settingsLoad),
  settingsSave: (settings) => call(CH.settingsSave, settings),
  settingsPickDirectory: () => call(CH.settingsPickDirectory),

  // Threads
  threadsLoad: () => call(CH.threadsLoad),
  threadsSave: (threads) => call(CH.threadsSave, threads),
  threadsRepairRedundant: (requests) => call(CH.threadsRepairRedundant, requests),
  threadsDeletePreview: (threadIds) => call(CH.threadsDeletePreview, threadIds),
  threadsDeleteApply: (threadIds, token) => call(CH.threadsDeleteApply, threadIds, token),

  // QA Pairs
  qaListAll: () => call(CH.qaListAll),
  qaGet: (id) => call(CH.qaGet, id),
  qaCreate: (data) => call(CH.qaCreate, data),
  qaUpdate: (id, data) => call(CH.qaUpdate, id, data),
  qaDelete: (id) => call(CH.qaDelete, id),

  // Search
  searchQuery: (query, type) => call(CH.searchQuery, query, type),
  searchSemantic: (query, topK) => call(CH.searchSemantic, query, topK),

  // AI
  aiGenerateMetadata: (id) => call(CH.aiGenerateMetadata, id),
  aiGenerateEmbedding: (id) => call(CH.aiGenerateEmbedding, id),
  aiGenerateAllEmbeddings: () => call(CH.aiGenerateAllEmbeddings),
  aiTestConnection: () => call(CH.aiTestConnection),
  aiListProviders: () => call(CH.aiListProviders),
  aiListModels: (providerId, forceRefresh, apiKeyOverride) =>
    call(CH.aiListModels, providerId, Boolean(forceRefresh), apiKeyOverride),
  aiSessionBrief: (topic) => call(CH.aiSessionBrief, topic),
  aiPriorArt: (query) => call(CH.aiPriorArt, query),
  aiGetTokenStats: () => call(CH.aiGetTokenStats),
  aiResetTokenStats: () => call(CH.aiResetTokenStats),
  aiSteelman: (hypothesis) => call(CH.aiSteelman, hypothesis),
  aiQuestionSeed: (topic) => call(CH.aiQuestionSeed, topic),
  aiConceptSummary: (concept) => call(CH.aiConceptSummary, concept),
  aiGenerateAnnotations: (ids) => call(CH.aiGenerateAnnotations, ids),
  aiApplyAnnotations: (approved) => call(CH.aiApplyAnnotations, approved),

  // Archive Health
  archiveHealthCheck: () => call(CH.archiveHealthCheck),

  // Secrets
  secretsLoad: () => call(CH.secretsLoad),
  secretsSave: (updates) => call(CH.secretsSave, updates),
  secretsRecheck: () => call(CH.secretsRecheck),
  secretsDevEnvVarNames: () => call(CH.secretsDevEnvVarNames),

  // Tag Dictionary
  tagsLoad: () => call(CH.tagsLoad),
  tagsSave: (dict) => call(CH.tagsSave, dict),
  tagsAdd: (tag, aliases) => call(CH.tagsAdd, tag, aliases),
  tagsRemove: (tag) => call(CH.tagsRemove, tag),
  tagsRename: (oldTag, newTag) => call(CH.tagsRename, oldTag, newTag),
  tagsAddAlias: (tag, alias) => call(CH.tagsAddAlias, tag, alias),
  tagsRemoveAlias: (tag, alias) => call(CH.tagsRemoveAlias, tag, alias),
  tagsResolve: (input) => call(CH.tagsResolve, input),
  tagsSync: () => call(CH.tagsSync),

  // Export / Import
  exportQA: (id) => call(CH.exportQa, id),
  exportThread: (threadId) => call(CH.exportThread, threadId),
  importFromFile: () => call(CH.importFile),
  importSharedLink: (url) => call(CH.importSharedLink, url),
  importArchiveCommit: (previewId, selection) =>
    call(CH.importArchiveCommit, previewId, selection),
  importArchiveCancel: (previewId) => call(CH.importArchiveCancel, previewId),

  onArchiveImportProgress: (callback) => {
    const handler = (_event: IpcRendererEvent, progress: unknown) => {
      if (isProgress(progress)) callback(progress)
    }
    ipcRenderer.on(EVENT_CH.archiveImportProgress, handler)
    return () => ipcRenderer.removeListener(EVENT_CH.archiveImportProgress, handler)
  },

  duplicatesScan: () => call(CH.duplicatesScan),
  duplicatesDelete: (requests) => call(CH.duplicatesDelete, requests),

  archiveResetPreview: () => call(CH.archiveResetPreview),
  archiveReset: () => call(CH.archiveReset),

  openExternal: (url) => call(CH.openExternal, url),

  onMenuAction: (callback) => {
    const handler = (_event: IpcRendererEvent, action: unknown) => {
      if (typeof action === 'string' && action.length > 0 && action.length <= 200) {
        callback(action)
      }
    }
    ipcRenderer.on(EVENT_CH.menuAction, handler)
    return () => ipcRenderer.removeListener(EVENT_CH.menuAction, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
