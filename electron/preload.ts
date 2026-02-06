import { contextBridge, ipcRenderer } from 'electron'

export interface AppSettings {
  dataDirectory: string
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
}

contextBridge.exposeInMainWorld('api', api)
