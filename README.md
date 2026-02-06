# LLM Aggregator

A desktop application for organizing and searching your LLM conversation Q&A pairs. Built with **Vue 3**, **TypeScript**, **Electron**, and **PrimeVue**.

## Features

- **Three-column OneNote-style layout** — Threads | QA List | QA Content
- **Thread management** — create, rename, delete, and reorder threads
- **QA pair management** — create, edit, delete Q&A entries; move/reorder within threads
- **Markdown rendering** — questions and answers displayed as rich Markdown with syntax-highlighted code blocks
- **Metadata tracking** — model/source, timestamp, tags, URL, version history
- **Search** — full-text and tag-based search across all QAs
- **Configurable data directory** — point the app at any folder; defaults to current working directory
- **Cross-platform** — builds native installers for macOS, Windows, and Linux

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

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+

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

## Configuration

On first launch, the app creates a `settings.json` file:
- **Development**: in the current working directory
- **Packaged app**: in the OS user-data directory (`~/Library/Application Support/LLM Aggregator` on macOS, `%APPDATA%/LLM Aggregator` on Windows)

```json
{
  "dataDirectory": "/path/to/your/data"
}
```

You can also change this from within the app via the **Settings** dialog (gear icon, top-left).

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

## License

MIT
