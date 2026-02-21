import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null

function createApplicationMenu() {
  const isMac = process.platform === 'darwin'
  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Usage Information',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'LLM Aggregator Usage',
              message: 'LLM Aggregator Comprehensive Usage',
              detail: `Overview:
The app maintains a local archive of your LLM chats organized in "threads". All questions and answers (QAs) are fully editable. Both questions and answers rendered in Markdown.

Layout:
- Left Panel: Thread management (Create, Rename, Delete).
- Middle Panel: Search & QA list. Navigate with Arrow keys.
- Right Panel: QA Content & Editor. 

Global Features:
- Threads: Create, rename (F2), and arrange.
- QAs: Move up/down within threads (Alt+Up/Down), edit (E), delete (Delete).
- Global Search: Click 'Search' or use shortcuts. Filters in real-time by text or tags.
- Editor: Supports Smart Tag Suggestions, Auto-title generation, and pre-filling metadata.
- Configurable Data Directory: Defaults to CWD, changeable in Settings.
- Dark Mode: Toggle via the moon/sun icon or Settings.

Keyboard Shortcuts:
- Ctrl/Cmd+F or / : Focus search box
- Ctrl/Cmd+N : Create new QA pair
- Ctrl/Cmd+S : Save current edit
- Ctrl/Cmd+, : Open settings
- Escape : Close dialog / cancel
- F2 : Rename selected thread
- Alt+Up / Down : Move QA in thread
- E : Edit selected QA
- Delete : Delete selected QA
- Ctrl/Cmd+K : Open command palette
- ? : Show keyboard shortcuts help
- Ctrl/Cmd+Enter : Submit form
- Arrow Up / Down : Navigate list items`,
            })
          }
        },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          {
            label: 'About LLM Aggregator',
            click: () => {
              dialog.showMessageBox({
                type: 'info',
                title: 'About LLM Aggregator',
                message: 'LLM Aggregator',
                detail: 'A desktop application for organizing and searching your LLM conversation Q&A pairs.\n\nBuilt with Vue 3, TypeScript, Electron, and PrimeVue.\nVersion: 1.0.0'
              })
            }
          }
        ])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

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
  createApplicationMenu()
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
