# Build & Debug Guide — LLM Aggregator

## Quick Start

```bash
npm install
npm run dev       # Electron app with hot-reload
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server + Electron window (hot-reload) |
| `npm run dev:server` | Start Vite server only (no Electron, for browser debugging) |
| `npm run build` | Type-check + production Vite build |
| `npm run electron:build` | Production build + native installer for current platform |
| `npm run electron:build:win` | Windows installer (NSIS + portable .exe) |
| `npm run electron:build:mac` | macOS installer (.dmg + .zip) |
| `npm run electron:build:linux` | Linux installer (.AppImage + .deb) |
| `npm run typecheck` | TypeScript type check only (no emit) |
| `npm run lint` | ESLint with auto-fix |
| `npm run test` | Run Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |


### Run in development mode

```bash
npm run dev
```

This starts the Vite dev server and launches the Electron window with hot-reload enabled.

By default, the app reads data from the **current working directory**. To use an existing data folder, either:
- Launch from that directory: `cd /path/to/your/data && /path/to/llm-aggregator/npm run dev`
- Or open **Settings** (gear icon) in the app and pick the folder containing your `archive/` and `threads.json`

### Type checking

```bash
npm run typecheck
```

### Run tests

```bash
npm test
```

### Run Electron UI tests with Playwright

For this repository, Playwright should be exposed three ways:

- `package.json` scripts for the common workflows that everyone should run the same way
- checked-in helpers under `scripts/` for reusable repo-specific CLI flows
- explicit CLI examples only when the flow is genuinely one-off

Common npm-script entrypoints:

```bash
npm run test:e2e
npm run test:e2e:debug
npm run test:e2e:ui
npm run test:e2e:report
npm run test:visual
npm run test:visual:update
```

Recommended visual-baseline workflow:

1. Run `npm run test:visual` to confirm whether the current UI differs from the approved snapshots.
2. If the UI change is intentional and should become the new baseline, run `npm run test:visual:update`.
3. Rerun `npm run test:e2e` so the suite passes against the updated approved snapshots.

Only update snapshots when you are intentionally accepting the current appearance. Do not use snapshot updates as a shortcut around unexplained UI regressions.

Direct CLI examples for targeted runs:

```bash
# Single Electron spec via repo helper
bash scripts/playwright-electron.sh tests/e2e/merged-features.spec.ts

# Single Electron spec with compact console output
bash scripts/playwright-electron.sh tests/e2e/merged-features.spec.ts --reporter=line

# Filter by test title
bash scripts/playwright-electron.sh --grep "supports collapse controls"
```

Repo-specific notes:

- Playwright is configured in `playwright.config.ts` with an `electron` project.
- `scripts/playwright-electron.sh` is the checked-in wrapper for targeted Electron Playwright runs.
- The Electron fixture in `tests/e2e/electron.fixture.ts` launches the app against a temporary isolated data directory.
- Reports are written to `playwright-report/`; transient run artifacts go to `test-results/`.
- Use the script helper when you need spec-level targeting or non-default reporters and want a repo-maintained entrypoint.

## Building Native Applications

### Build for the current platform

```bash
npm run electron:build
```

### Build for a specific platform

```bash
# macOS — produces .dmg and .zip
npm run electron:build:mac

# Windows — produces NSIS installer and portable .exe
npm run electron:build:win

# Linux — produces .AppImage and .deb
npm run electron:build:linux
```

### Build output

Installers are placed in the `release/` directory:

| Platform | Formats | File |
|----------|---------|------|
| macOS | `.dmg`, `.zip` | `LLM Aggregator-{version}-mac.dmg` |
| Windows | `.exe` (NSIS), portable | `LLM Aggregator-{version}-win.exe` |
| Linux | `.AppImage`, `.deb` | `LLM Aggregator-{version}-linux.AppImage` |

### Notes on cross-platform builds

- macOS builds require a macOS host (code signing is optional but recommended for distribution)
- Windows builds can be made on macOS/Linux using Wine (installed automatically by electron-builder)
- Linux builds work on any Linux host

## VS Code Extensions

Install these before debugging:

- **Vue - Official** (`vue.volar`) — required for breakpoints in `.vue` files and Vue Language Features
- **TypeScript Vue Plugin** (bundled with Vue - Official)

Also recommended: install **Vue DevTools** in Chrome/Edge browser for frontend-only debugging:
https://devtools.vuejs.org/

## Debugging

Before debugging, run type-check and lint to catch errors early:

```bash
npm run typecheck
npm run lint
```

### Option 1: Frontend only (browser, no Electron)

Use this when working on UI components that don't need native file I/O.

1. Start the Vite server:
   ```bash
   npm run dev:server
   ```
2. In VS Code, use one of these launch configurations:
   - **"Chrome Launch Frontend"** — opens Chrome pointed at `localhost:5173`
   - **"Edge Launch Frontend"** — same but for Edge

The Vite server defaults to port **5173**. If it starts on port 5174 or higher, there is an orphaned Vite process running — find and kill it first.

In browser mode, `window.api` is unavailable (no Electron IPC), so data operations will fail gracefully or be mocked.

### Option 2: Full stack (Electron + Vue, recommended)

Use this when you need to debug IPC, file I/O, or the Electron main process alongside the Vue frontend.

Launch the compound configuration:

**"Full Stack: Backend + Renderer"**

This compound:
1. Starts the Vite dev server (`dev:server` script)
2. Launches the Electron main process with the Node.js debugger attached (port **9223**)
3. Attaches Chromium DevTools to the renderer process

Breakpoints can be set in both `.ts` / `.vue` renderer files and `electron/` main process files.

> Note: Vue DevTools browser extension is **not** available in this mode (Electron's Chromium doesn't support extensions). Use Chromium DevTools instead.

### Ports

| Service | Port |
|---------|------|
| Vite dev server | 5173 |
| Electron Node.js debugger | 9223 |

### Avoiding orphaned processes

Before starting a debug session, make sure no previous instances are running:
- Kill any `Vite` terminal in VS Code that is still active
- Kill any running Electron window from a previous session
- Check Task Manager (Windows) or `ps aux | grep electron` (macOS/Linux)

## Project Structure

```
├── electron/                  # Electron main process (Node.js)
│   ├── main.ts               # Window creation, app lifecycle
│   ├── preload.ts            # Context bridge (IPC API for renderer)
│   ├── ipc/
│   │   └── handlers.ts       # IPC channel handlers
│   └── services/
│       ├── settingsService.ts # App settings (data directory path)
│       ├── pathResolver.ts    # Data directory resolution
│       ├── threadService.ts   # threads.json read/write
│       ├── qaPairService.ts   # archive/*.md read/write/parse
│       └── searchService.ts   # Full-text and tag search
├── src/                       # Vue 3 renderer
│   ├── main.ts               # Vue entry point
│   ├── App.vue               # Root component
│   ├── components/
│   │   ├── ThreadsPanel.vue   # Left column — thread list
│   │   ├── QAListPanel.vue    # Middle column — QA list
│   │   ├── QAContentPanel.vue # Right column — QA viewer
│   │   ├── QAMetadataBar.vue  # Metadata ribbon (model, date, tags)
│   │   ├── QAEditor.vue       # New QA creation dialog
│   │   ├── QAEditForm.vue     # Edit existing QA form
│   │   ├── MarkdownRenderer.vue # Markdown-to-HTML with syntax highlight
│   │   └── SettingsDialog.vue # Data directory settings
│   ├── stores/                # Pinia state management
│   │   ├── threadStore.ts
│   │   ├── qaStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   ├── QAPair.ts
│   │   └── Thread.ts
│   └── assets/styles/
│       └── main.css
├── package.json
├── vite.config.mts
├── tsconfig.json
├── electron-builder.yml       # Native packaging config
└── index.html
```



## Data Files (Runtime)

At runtime the app reads/writes from a configurable **data directory** (default: CWD in dev, `userData` in packaged builds):

```
<dataDirectory>/
├── settings.json       # App settings
├── threads.json        # Thread definitions and QA ordering
└── archive/
    ├── 20260204_2135_00_claude_whatIsLife.md
    ├── 20260205_1845_00_chatgpt_howToSortArray.md
    └── ...
```


## Technology Stack

| Component | Technology |
|-----------|-----------|
| UI Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript |
| Desktop Shell | Electron |
| Build Tool | Vite + vite-plugin-electron |
| State Management | Pinia |
| Component Library | PrimeVue 4 (Aura theme) |
| Markdown Rendering | markdown-it + highlight.js |
| Frontmatter Parsing | gray-matter |
| Native Packaging | electron-builder |

## Data Format

The application stores data as plain files — no database required:

- **`threads.json`** — thread definitions and QA ordering
- **`archive/*.md`** — individual QA pairs as Markdown files with YAML frontmatter

These files are fully portable and human-readable. You can edit them outside the app, back them up with git, or share them across machines.

### QA File Example

```markdown
---
id: '20260204_2135'
title: ResTest1
source: claude
url: www.example.com
tags:
  - research
timestamp: '2026-02-04T21:35:57.826479'
version: 1
thread_pairs: []
---

## Question
What is the meaning of life?

## Answer
42
```

