import type { QAPairData, QACreateData, QAUpdateData } from './types/QAPair'
import type { ThreadMap } from './types/Thread'

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
  threadsLoad: () => Promise<ThreadMap>
  threadsSave: (threads: ThreadMap) => Promise<void>

  // QA Pairs
  qaListAll: () => Promise<Record<string, QAPairData>>
  qaGet: (id: string) => Promise<QAPairData | null>
  qaCreate: (data: QACreateData) => Promise<QAPairData>
  qaUpdate: (id: string, data: QAUpdateData) => Promise<QAPairData>
  qaDelete: (id: string) => Promise<void>
  searchQuery: (query: string, type: 'full-text' | 'tags') => Promise<string[]>

  // Export / Import
  exportQA: (id: string) => Promise<ExportResult | null>
  exportThread: (threadId: string) => Promise<ExportResult | null>
  importFromFile: () => Promise<ImportResult | null>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
