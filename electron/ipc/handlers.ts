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

export function registerIpcHandlers(): void {
  // ─── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', async (): Promise<AppSettings> => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings): Promise<void> => {
    saveSettings(settings)
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
}
