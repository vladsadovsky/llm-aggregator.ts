import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface AppSettings {
  dataDirectory: string
  llmProvider: string
  llmModel: string
  tagEnforcement: 'off' | 'warn' | 'strict'
  tagSoftLimit: number
  tagHardLimit: number
  allowDevEnvSecrets: boolean
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

export type ProviderId = 'chatgpt' | 'gemini' | 'copilot'

export interface SharedImportQA {
  data: QACreateData
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
  threadsLoad: () => Promise<Record<string, { name: string; items: string[] }>>
  threadsSave: (threads: Record<string, { name: string; items: string[] }>) => Promise<void>

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
  importFromFile: () => Promise<ImportResult | null>
  importSharedLink: (url: string) => Promise<SharedImportResult>

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


const api: ElectronAPI = {
  // Settings
  settingsLoad: () => ipcRenderer.invoke('settings:load'),
  settingsSave: (settings) => ipcRenderer.invoke('settings:save', settings),
  settingsPickDirectory: () => ipcRenderer.invoke('settings:pickDirectory'),

  // Threads
  threadsLoad: () => ipcRenderer.invoke('threads:load'),
  threadsSave: (threads) => ipcRenderer.invoke('threads:save', threads),

  // QA Pairs
  qaListAll: () => ipcRenderer.invoke('qa:listAll'),
  qaGet: (id) => ipcRenderer.invoke('qa:get', id),
  qaCreate: (data) => ipcRenderer.invoke('qa:create', data),
  qaUpdate: (id, data) => ipcRenderer.invoke('qa:update', id, data),
  qaDelete: (id) => ipcRenderer.invoke('qa:delete', id),

  // Search
  searchQuery: (query, type) => ipcRenderer.invoke('search:query', query, type),
  searchSemantic: (query, topK) => ipcRenderer.invoke('search:semantic', query, topK),

  // AI
  aiGenerateMetadata: (id) => ipcRenderer.invoke('ai:generateMetadata', id),
  aiGenerateEmbedding: (id) => ipcRenderer.invoke('ai:generateEmbedding', id),
  aiGenerateAllEmbeddings: () => ipcRenderer.invoke('ai:generateAllEmbeddings'),
  aiTestConnection: () => ipcRenderer.invoke('ai:testConnection'),
  aiListProviders: () => ipcRenderer.invoke('ai:listProviders'),
  aiListModels: (providerId, forceRefresh, apiKeyOverride) =>
    ipcRenderer.invoke('ai:listModels', providerId, Boolean(forceRefresh), apiKeyOverride),
  aiSessionBrief: (topic) => ipcRenderer.invoke('ai:sessionBrief', topic),
  aiPriorArt: (query) => ipcRenderer.invoke('ai:priorArt', query),
  aiGetTokenStats: () => ipcRenderer.invoke('ai:getTokenStats'),
  aiResetTokenStats: () => ipcRenderer.invoke('ai:resetTokenStats'),
  aiSteelman: (hypothesis) => ipcRenderer.invoke('ai:steelman', hypothesis),
  aiQuestionSeed: (topic) => ipcRenderer.invoke('ai:questionSeed', topic),
  aiConceptSummary: (concept) => ipcRenderer.invoke('ai:conceptSummary', concept),
  aiGenerateAnnotations: (ids) => ipcRenderer.invoke('ai:generateAnnotations', ids),
  aiApplyAnnotations: (approved) => ipcRenderer.invoke('ai:applyAnnotations', approved),

  // Archive Health
  archiveHealthCheck: () => ipcRenderer.invoke('archive:healthCheck'),

  // Secrets
  secretsLoad: () => ipcRenderer.invoke('secrets:load'),
  secretsSave: (updates) => ipcRenderer.invoke('secrets:save', updates),
  secretsRecheck: () => ipcRenderer.invoke('secrets:recheck'),
  secretsDevEnvVarNames: () => ipcRenderer.invoke('secrets:devEnvVarNames'),

  // Tag Dictionary
  tagsLoad: () => ipcRenderer.invoke('tags:load'),
  tagsSave: (dict) => ipcRenderer.invoke('tags:save', dict),
  tagsAdd: (tag, aliases) => ipcRenderer.invoke('tags:add', tag, aliases),
  tagsRemove: (tag) => ipcRenderer.invoke('tags:remove', tag),
  tagsRename: (oldTag, newTag) => ipcRenderer.invoke('tags:rename', oldTag, newTag),
  tagsAddAlias: (tag, alias) => ipcRenderer.invoke('tags:addAlias', tag, alias),
  tagsRemoveAlias: (tag, alias) => ipcRenderer.invoke('tags:removeAlias', tag, alias),
  tagsResolve: (input) => ipcRenderer.invoke('tags:resolve', input),
  tagsSync: () => ipcRenderer.invoke('tags:sync'),

  // Export / Import
  exportQA: (id) => ipcRenderer.invoke('export:qa', id),
  exportThread: (threadId) => ipcRenderer.invoke('export:thread', threadId),
  importFromFile: () => ipcRenderer.invoke('import:file'),
  importSharedLink: (url) => ipcRenderer.invoke('import:sharedLink', url),

  onMenuAction: (callback) => {
    const handler = (_event: IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
