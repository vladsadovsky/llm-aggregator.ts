import { contextBridge, ipcRenderer } from 'electron'

export interface AppSettings {
  dataDirectory: string
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

  // Export / Import
  exportQA: (id) => ipcRenderer.invoke('export:qa', id),
  exportThread: (threadId) => ipcRenderer.invoke('export:thread', threadId),
  importFromFile: () => ipcRenderer.invoke('import:file'),
}

contextBridge.exposeInMainWorld('api', api)
