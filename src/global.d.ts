import type { QAPairData, QACreateData, QAUpdateData } from './types/QAPair'
import type { ThreadMap } from './types/Thread'

export interface AppSettings {
  dataDirectory: string
  llmProvider: string
  llmModel: string
  lensEnabled: boolean
  tagEnforcement: 'off' | 'warn' | 'strict'
  tagSoftLimit: number
  tagHardLimit: number
  allowDevEnvSecrets: boolean
}

export type ModelTier = 'budget' | 'balanced' | 'premium' | 'unknown'
export type LatencyTier = 'fast' | 'medium' | 'slow' | 'unknown'

export interface ProviderDescriptor {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'openai-compatible'
  enabled: boolean
  comingSoon?: boolean
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey'
  supportsModelDiscovery: boolean
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

export interface ImportedQA {
  data: QACreateData
  warnings: string[]
  originalId: string
  originalTimestamp: string
}

export interface ImportResult {
  exportType: 'qa' | 'thread' | 'unknown'
  threadName?: string
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

export interface BulkImportSelection {
  threadSourceIds: string[]
  skipDuplicates: boolean
  /** Prefix each created thread's name with its UTC calendar day (gemini-takeout only). */
  includeDateInThreadNames?: boolean
}

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
  failed: number
  threadNames: string[]
  warnings: string[]
}

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
  threadsLoad: () => Promise<ThreadMap>
  threadsSave: (threads: ThreadMap) => Promise<void>

  // QA Pairs
  qaListAll: () => Promise<Record<string, QAPairData>>
  qaGet: (id: string) => Promise<QAPairData | null>
  qaCreate: (data: QACreateData) => Promise<QAPairData>
  qaUpdate: (id: string, data: QAUpdateData) => Promise<QAPairData>
  qaDelete: (id: string) => Promise<void>
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
  importArchiveCommit: (
    previewId: string,
    selection: BulkImportSelection,
  ) => Promise<BulkImportCommitResult>
  importArchiveCancel: (previewId: string) => Promise<void>
  onArchiveImportProgress: (callback: (progress: BulkImportProgress) => void) => () => void

  // Duplicate cleanup
  duplicatesScan: () => Promise<DuplicateScanResult>
  duplicatesDelete: (ids: string[]) => Promise<DuplicateCleanupResult>

  // Archive reset (Tools → Reset Archive)
  archiveResetPreview: () => Promise<ArchiveResetPreview>
  archiveReset: () => Promise<ArchiveResetResult>

  // Native application menu → renderer. Returns an unsubscribe function.
  onMenuAction: (callback: (action: string) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
