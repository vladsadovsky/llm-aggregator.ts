import { contextBridge, ipcRenderer } from 'electron'

export interface AppSettings {
  dataDirectory: string
  llmProvider: 'openai' | 'anthropic'
  llmModel: string
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

export interface ElectronAPI {
  // Settings
  settingsLoad: () => Promise<AppSettings>
  settingsSave: (settings: AppSettings) => Promise<void>
  settingsPickDirectory: () => Promise<string | null>

  // Secrets
  secretsLoad: () => Promise<AppSecrets>
  secretsSave: (secrets: AppSecrets) => Promise<void>

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

  // Export / Import
  exportQA: (id: string) => Promise<ExportResult | null>
  exportThread: (threadId: string) => Promise<ExportResult | null>
  importFromFile: () => Promise<ImportResult | null>
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

export interface AppSecrets {
  openaiApiKey: string
  anthropicApiKey: string
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
  secretsSave: (secrets) => ipcRenderer.invoke('secrets:save', secrets),

  // Export / Import
  exportQA: (id) => ipcRenderer.invoke('export:qa', id),
  exportThread: (threadId) => ipcRenderer.invoke('export:thread', threadId),
  importFromFile: () => ipcRenderer.invoke('import:file'),
}

contextBridge.exposeInMainWorld('api', api)
