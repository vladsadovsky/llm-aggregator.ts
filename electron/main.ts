import { app, BrowserWindow, Menu, dialog, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc/handlers'
import { initSecretsStorage } from './services/secretsService'
import { loadSettings } from './services/settingsService'
import { addSettingsChangeListener } from './services/settingsEvents'
import { ACCELERATORS, hintFor, renderKeys, styleForPlatform } from '../shared/accelerators'
import { isSameAppNavigation, windowOpenAction } from './security/navigationPolicy'
import type { SenderPolicy } from './ipc/senderPolicy'

let mainWindow: BrowserWindow | null = null

// ─── App origin (computed once) ──────────────────────────────────────────────
// The renderer entry — dev server URL or packaged index.html. Both the
// navigation lockdown and the IPC sender guard resolve the app's own origin from
// here so a privileged channel can only be invoked by a frame we actually loaded.
const devUrl = process.env.VITE_DEV_SERVER_URL
const prodIndexPath = devUrl
  ? undefined
  : [join(__dirname, '../dist/index.html'), join(__dirname, '../index.html')].find((c) => existsSync(c))
const appOrigin = (() => {
  try {
    const href = devUrl ?? (prodIndexPath ? pathToFileURL(prodIndexPath).href : '')
    return href ? new URL(href).origin : ''
  } catch {
    return ''
  }
})()

// Trusted-sender policy for every privileged IPC channel (INV-IPC). Only the
// main window's top frame, loaded from the app origin, may invoke.
const senderPolicy: SenderPolicy = {
  trusted: () => mainWindow?.webContents ?? null,
  allowedOrigins: () => (appOrigin ? [appOrigin] : []),
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin'
  const mod = isMac ? 'Cmd' : 'Ctrl'
  const style = styleForPlatform(isMac)
  const lensEnabled = loadSettings().lensEnabled

  // Route a menu click to the renderer's central command registry (App.vue).
  const send = (action: string) => () => mainWindow?.webContents.send('menu-action', action)

  // App-action menu item. The shortcut shown is looked up from
  // `shared/accelerators.ts` by command id, never passed in by hand — hand-typed
  // hints are exactly what drifted from the handler before (issue #8).
  //
  // It stays a display-only *label*, not an Electron accelerator: the keys are
  // handled in the renderer (see handleGlobalKeydown), and registering them here
  // too would double-fire and hijack typing.
  const mi = (label: string, action: string) => {
    const hint = hintFor(action, style)
    return {
      id: action,
      label: hint ? `${label}  (${hint})` : label,
      click: send(action),
    }
  }

  /** The Keyboard Shortcuts block of the usage dialog, from the same table. */
  const shortcutLines = ACCELERATORS.map(
    (a) => `- ${renderKeys(a.keys, style)} : ${a.description}${a.context === 'Global' ? '' : `  [${a.context}]`}`,
  ).join('\n')

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
- Import → From shared link (${mod}+Shift+O): paste a Claude / ChatGPT / Gemini / Copilot share URL
  to import an entire conversation, split into Q&A pairs and grouped into a new thread.

Organizing
- Threads: create, rename (F2), tag, and reorder Q&As within a thread (Alt+Up / Alt+Down).
- Q&A: edit (${hintFor('qa.edit', style)}), duplicate (${hintFor('qa.duplicate', style)}),
  delete (${hintFor('qa.delete', style)}), export (${hintFor('io.export', style)}).
- Views: Show All Q&As, Show Unthreaded, collapse the Threads / List panels.

Search & optional AI
- Search box (${mod}+F or /): full-text or tag search; switch scope to the whole archive.
- LLM Lens: optional archive exploration panel. Enable it in Settings → AI; it requires
  an OpenAI key and embeddings. Semantic search and metadata are available independently.

Discoverability
- Every command is available in the Command Palette (${mod}+K) and in this application menu bar.
- The most common actions also appear as toolbar buttons.
  - Data directory, AI keys, and preferences live in Settings (${mod}+,).
  - Application Status and archive maintenance commands live in View.
- This guide is always available from the menu bar via Help → Usage Information.

Keyboard Shortcuts
${shortcutLines}

Note: ${mod}+Plus / ${mod}+Minus / ${mod}+0 zoom the whole window (a standard
Electron behaviour). The Q&A content zoom under View is a separate, finer
control and is reached from the menu or the Command Palette.`

  const aboutDetail =
    'A desktop application for organizing and searching your LLM conversation Q&A pairs.\n\n' +
    'Built with Vue 3, TypeScript, Electron, and PrimeVue.\n' +
    `Version: ${app.getVersion()}`

  const showUsage = () =>
    dialog.showMessageBox({ type: 'info', title: 'LLM Aggregator Usage', message: 'LLM Aggregator — Usage', detail: usageDetail })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electron menu template mixes role/separator/click item shapes; annotating each literal adds noise, not safety.
  const template: any[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        mi('Settings…', 'app.settings'),
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
        mi('New Q&A', 'qa.new'),
        { type: 'separator' },
        mi('Import from File…', 'io.importFile'),
        mi('Import from Shared Link…', 'io.importSharedLink'),
        mi('Export Selected Q&A / Thread…', 'io.export'),
        { type: 'separator' },
        ...(isMac ? [] : [mi('Settings…', 'app.settings'), { type: 'separator' }]),
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
        mi('Edit Selected', 'qa.edit'),
        mi('Duplicate Selected', 'qa.duplicate'),
        mi('Delete Selected', 'qa.delete'),
        mi('Save Changes', 'qa.save'),
        { type: 'separator' },
        mi('Move Up in Thread', 'qa.moveUp'),
        mi('Move Down in Thread', 'qa.moveDown')
      ]
    },
    {
      label: 'Thread',
      submenu: [
        // "New Thread" now lives under File with the other creation verbs.
        mi('Rename Selected Thread', 'thread.rename'),
        { type: 'separator' },
        mi('Show All Q&As', 'view.showAll'),
        mi('Show Unthreaded Q&As', 'view.showUnthreaded')
      ]
    },
    {
      label: 'View',
      submenu: [
        mi('Focus Search', 'search.focus'),
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
      label: 'Tools',
      submenu: [
        mi('Manage Tag Dictionary…', 'view.manageTags'),
        mi('Generate All Embeddings', 'view.generateEmbeddings'),
        mi('Run Confidence Annotation Pass…', 'view.annotationPass'),
        mi('Run Archive Health Check…', 'view.healthCheck'),
        { type: 'separator' },
        mi('Find Duplicate Q&As…', 'tools.findDuplicates'),
        { type: 'separator' },
        mi('Reset Archive (Clear Everything)…', 'tools.resetArchive'),
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
        mi('Open Command Palette', 'app.commandPalette'),
        mi('Keyboard Shortcuts', 'app.shortcuts'),
        mi('Application Status', 'view.status'),
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
      // Keep explicit even though it is the current default, so the intended policy is
      // visible in code and cannot be silently weakened.
      sandbox: true,
    },
  }
  )

  const wc = mainWindow.webContents

  // ─── Navigation lockdown (SEC-01) ──────────────────────────────────────────
  // The main window renders trusted local content and exposes window.api. Deny
  // any navigation away from the app's own origin and deny renderer-created
  // windows, so imported content (e.g. a Markdown link) can never pull this
  // privileged renderer to a remote page that could then reach window.api.
  const navPolicy = { devUrl, appOrigin }

  wc.on('will-navigate', (event, url) => {
    if (!isSameAppNavigation(url, navPolicy)) {
      event.preventDefault()
      console.error('[main] blocked main-frame navigation to', url)
    }
  })
  wc.on('will-frame-navigate', (details) => {
    if (!isSameAppNavigation(details.url, navPolicy)) {
      details.preventDefault()
      console.error('[main] blocked frame navigation to', details.url)
    }
  })
  wc.setWindowOpenHandler(windowOpenAction)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] Window failed to load:', { errorCode, errorDescription, validatedURL })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] Renderer process gone:', details)
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[main] Renderer became unresponsive')
  })
  mainWindow.webContents.on('console-message', (details) => {
    console.error(
      `[renderer:${details.level}] ${details.sourceId}:${details.lineNumber} ${details.message}`,
    )
  })

  // In dev, load from Vite dev server; in prod, the packaged index.html.
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    // Uncomment to open DevTools in development automatically
    //mainWindow.webContents.openDevTools()
  } else if (prodIndexPath) {
    mainWindow.loadFile(prodIndexPath)
  } else {
    console.error('[main] Renderer entry not found under', __dirname)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.setName('LLM Aggregator');

/**
 * Deny web permissions on the default session (SEC-01). Scoped to the default
 * session deliberately: the Gemini hidden import window shares it and therefore
 * inherits the denial (a free SEC-03 gain). `clipboard-sanitized-write` is the
 * one allowance — the Lens "Copy" actions need it and it only writes to the
 * clipboard; everything else (geolocation, media, notifications, openExternal…)
 * is refused.
 */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])
function lockDownDefaultSession(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
}

app.whenReady().then(() => {
  // Must run before any secrets read: moves a legacy plaintext secrets.json aside
  // so live keys are not left sitting in clear text with nothing to clean them up.
  initSecretsStorage()
  lockDownDefaultSession()
  createApplicationMenu()
  addSettingsChangeListener(() => createApplicationMenu())
  registerIpcHandlers(senderPolicy)
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
