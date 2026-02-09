# LLM Aggregator


## Getting Started

### Install dependencies

```bash
npm install
```

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

- macOS builds require a macOS host (code signing is optional)
- Windows builds can be made on macOS/Linux using Wine (installed automatically by electron-builder)
- Linux builds work on any Linux host


## Debugging 

It is important to install Vue Visual Code extension (vue.solar) from the store in order to enable setting up breakpoints in source code and other Vue extended functions.

Before starting source level debugging you are advised to run both typecheck and lint steps if you are modifying the codebase, by using following npm commands:

```
npm run typecheck
npm run lint 
```

Default ports are used: 5173 for Vite access and 9223 for Electron native process.

### Debugging front end only (no Electron)
Debugging of the front end (UI components) without access to native Electron functionality is possible and sometimes preferable to do when the browser launches with ```npm run dev``` and DevTools panel is used. It is recommended that in addition to Chrome Dev Tools Vue Dev Tools are also installed  https://devtools.vuejs.org/. When debugging front end only Edge browser may also be used in the same way, but with the different launch configuration.

Launch configuraitons for front end only are 

"Eddge Launch Frontend" 
Chrome Launch Frontend",

Both of them expect Vite server (Launched by ```npm run dev``` command) to be running and ports must be matched. Default port used is Vite default 5173 on localhost.  Command may be executed in VSCode built in terminal or in the outside terminal. 

If you see a message that Vite server started on port 5174 or later, that means there is an orphaned running copy of the server or server from another app under development, that must be terminated. 


### Debugging full stack (both front end and Electron backend)
When needed, Visual Code fully integrated  full stack debugging is enabled via the compound configuration caleld "Full Stack: Backend and Renderer". This compount combines two separateconfigurations , one for the launching Electron backend, called ""Electron Main (Backend)"and an attaching configuraiton, called "Electron Renderer (FrontEnd)". Chomium embedded into Electron is utilized  by creating a new attaching configuraiton and a new compound. In this mode of debugging breakpoints can be set up both in front end code (Chromium) and Electron native backend code (node process), tho Vue Devtools won't be available in the front end. 

Compound configuration will pre-launch start of the necessary vite web server, thus you need to make sure previous instance is stopped. Usually if the instance is stuck in VS Code Terminal, need to kill it. 

Name of the compound launch configuration you launch to start both Vite server and electron process, as well as Chromium browser instance is "Full Stack: Backend + Renderer"

Note, the same as with front end debugging, make sure you don't have orphaned instances of Vite server and Electron processes. 

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
├── vite.config.ts
├── tsconfig.json
├── electron-builder.yml       # Native packaging config
└── index.html
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

