import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'LLM Aggregator',
    icon: join(__dirname, process.platform === 'darwin'
      ? '../public/icons/llm-aggregator.icns'
      : '../public/icons/llm-aggregator.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
  )

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] Window failed to load:', { errorCode, errorDescription, validatedURL })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] Renderer process gone:', details)
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[main] Renderer became unresponsive')
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error']
    const label = levels[level] ?? `level-${level}`
    console.error(`[renderer:${label}] ${sourceId}:${line} ${message}`)
  })

  // In dev, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Uncomment to open DevTools in development automatically
    //mainWindow.webContents.openDevTools()
  } else {
    const candidatePaths = [
      join(__dirname, '../dist/index.html'),
      join(__dirname, '../index.html'),
    ]
    const indexPath = candidatePaths.find((candidate) => existsSync(candidate))

    if (!indexPath) {
      console.error('[main] Renderer entry not found. Tried:', candidatePaths)
    } else {
      mainWindow.loadFile(indexPath)
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.setName('LLM Aggregator');

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
