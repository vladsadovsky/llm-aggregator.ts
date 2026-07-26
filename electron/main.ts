import { app, BrowserWindow, Menu, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc/handlers'
import { initSecretsStorage } from './services/secretsService'
import { loadSettings } from './services/settingsService'
import { setSettingsChangeListener } from './services/settingsEvents'

let mainWindow: BrowserWindow | null = null

function createApplicationMenu() {
  const isMac = process.platform === 'darwin'
  const mod = isMac ? 'Cmd' : 'Ctrl'
  const lensEnabled = loadSettings().lensEnabled

  // Route a menu click to the renderer's central command registry (App.vue).
  const send = (action: string) => () => mainWindow?.webContents.send('menu-action', action)

  // App-action menu item. `hint` is a display-only shortcut label — the keys
  // themselves are handled in the renderer (see handleGlobalKeydown), so we do
  // NOT set an accelerator here (that would double-fire / hijack typing).
  const mi = (label: string, action: string, hint?: string) => ({
    label: hint ? `${label}  (${hint})` : label,
    click: send(action),
  })

  const usageDetail = `Overview
LLM Aggregator keeps a local, fully-editable archive of Q&A pairs captured from
LLM chats (Claude, ChatGPT, Gemini, Copilot, …), organized into ordered "threads".
Questions and answers are stored as Markdown files you own.

Layout
- Left panel: Threads (create, rename, tag, delete).
- Middle panel: Search + Q&A list (navigate with Arrow keys).
- Right panel: Q&A viewer / editor.

Getting content in
- New Q&A (${mod}+N): write or paste a pair; structured paste can create several at once.
- Import → From file (${mod}+O): re-import an exported .md (single Q&A or a whole thread).
- Import → From shared link (${mod}+Shift+O): paste a ChatGPT / Gemini / Copilot share URL
  to import an entire conversation, split into Q&A pairs and grouped into a new thread.

Organizing
- Threads: create, rename (F2), tag, and reorder Q&As within a thread (Alt+Up / Alt+Down).
- Q&A: edit (E), duplicate (D), delete (Delete), export (X).
- Views: Show All Q&As, Show Unthreaded, collapse the Threads / List panels.

Search & optional AI
- Search box (${mod}+F or /): full-text or tag search; switch scope to the whole archive.
- LLM Lens: optional archive exploration panel. Enable it in Settings → AI; it requires
  an OpenAI key and embeddings. Semantic search and metadata are available independently.

Discoverability
- Every command is available in the Command Palette (${mod}+K) and in this application menu bar.
- The most common actions also appear as toolbar buttons.
- Data directory, AI keys, tag dictionary, and archive health live in Settings (${mod}+,).
- This guide is always available from the menu bar via Help → Usage Information.

Keyboard Shortcuts
- ${mod}+F or / : Focus search
- ${mod}+N : New Q&A
- ${mod}+S : Save current edit
- ${mod}+O : Import from file
- ${mod}+Shift+O : Import from shared link
- ${mod}+, : Settings
- ${mod}+K : Command palette
- Escape : Close dialog / cancel
- F2 : Rename selected thread
- Alt+Up / Alt+Down : Move Q&A within thread
- E : Edit selected Q&A     D : Duplicate     Delete : Delete     X : Export
- ? : Keyboard shortcuts help
- ${mod}+Enter : Submit form     Arrow Up / Down : Navigate lists`

  const aboutDetail =
    'A desktop application for organizing and searching your LLM conversation Q&A pairs.\n\n' +
    'Built with Vue 3, TypeScript, Electron, and PrimeVue.\n' +
    `Version: ${app.getVersion()}`

  const showUsage = () =>
    dialog.showMessageBox({ type: 'info', title: 'LLM Aggregator Usage', message: 'LLM Aggregator — Usage', detail: usageDetail })

  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        mi('Settings…', 'app.settings', `${mod}+,`),
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
        // Creation verbs live together under File, per platform convention.
        mi('New Thread', 'thread.new'),
        mi('New Q&A', 'qa.new', `${mod}+N`),
        { type: 'separator' },
        mi('Import from File…', 'io.importFile', `${mod}+O`),
        mi('Import from Shared Link…', 'io.importSharedLink', `${mod}+Shift+O`),
        mi('Export Selected Q&A / Thread…', 'io.export', 'X'),
        { type: 'separator' },
        ...(isMac ? [] : [mi('Settings…', 'app.settings', `${mod}+,`), { type: 'separator' }]),
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
          { role: 'selectAll' }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    {
      label: 'Q&A',
      submenu: [
        mi('Edit Selected', 'qa.edit', 'E'),
        mi('Duplicate Selected', 'qa.duplicate', 'D'),
        mi('Delete Selected', 'qa.delete', 'Delete'),
        mi('Save Changes', 'qa.save', `${mod}+S`),
        { type: 'separator' },
        mi('Move Up in Thread', 'qa.moveUp', 'Alt+Up'),
        mi('Move Down in Thread', 'qa.moveDown', 'Alt+Down')
      ]
    },
    {
      label: 'Thread',
      submenu: [
        // "New Thread" now lives under File with the other creation verbs.
        mi('Rename Selected Thread', 'thread.rename', 'F2'),
        { type: 'separator' },
        mi('Show All Q&As', 'view.showAll'),
        mi('Show Unthreaded Q&As', 'view.showUnthreaded')
      ]
    },
    {
      label: 'View',
      submenu: [
        mi('Focus Search', 'search.focus', `${mod}+F`),
        mi('Toggle Dark Mode', 'view.darkMode'),
        ...(lensEnabled ? [mi('Toggle LLM Lens', 'view.lens')] : []),
        { type: 'separator' },
        mi('Toggle Threads Panel', 'view.toggleThreads'),
        mi('Toggle List Panel', 'view.toggleList'),
        { type: 'separator' },
        mi('Zoom Content In', 'view.zoomIn'),
        mi('Zoom Content Out', 'view.zoomOut'),
        mi('Reset Content Zoom', 'view.zoomReset'),
        { type: 'separator' },
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
        mi('Open Command Palette', 'app.commandPalette', `${mod}+K`),
        mi('Keyboard Shortcuts', 'app.shortcuts', '?'),
        { type: 'separator' },
        { label: 'Usage Information', click: showUsage },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          {
            label: 'About LLM Aggregator',
            click: () => {
              dialog.showMessageBox({
                type: 'info',
                title: 'About LLM Aggregator',
                message: 'LLM Aggregator',
                detail: aboutDetail
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
  // Must run before any secrets read: moves a legacy plaintext secrets.json aside
  // so live keys are not left sitting in clear text with nothing to clean them up.
  initSecretsStorage()
  createApplicationMenu()
  setSettingsChangeListener(() => createApplicationMenu())
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
