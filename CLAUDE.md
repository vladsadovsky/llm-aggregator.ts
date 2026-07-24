# CLAUDE.md — LLM Aggregator

Context for Claude Code when working on this project.

## Project Summary

**LLM Aggregator** is a local-first Electron + Vue 3 desktop app for archiving and organizing Q&A pairs copied from LLM conversations (Claude, ChatGPT, Copilot, Grok, etc.). The key design philosophy: the archive is fully editable and offline — no sync with original LLM sessions. Users can create, edit, merge, split, and manually write QA pairs, and group them into "threads" (ordered, reorderable lists).

**Authors:** Eugene Veselov (`eveselov@hotmail.com`), Vlad Sadovsky (`sadovskyvlad@gmail.com`)

## Architecture Overview

The project has two separate runtime processes communicating via Electron IPC:

```
Renderer (Chromium / Vue 3)          Main Process (Node.js / Electron)
─────────────────────────────        ────────────────────────────────
src/                                 electron/
  App.vue                              main.ts           ← window creation
  components/                          preload.ts        ← context bridge
  stores/ (Pinia)                      ipc/handlers.ts   ← IPC routing
  types/                               services/         ← data layer
  utils/
```

**All file I/O lives in `electron/services/`.** The renderer never touches the filesystem directly — it calls `window.api.*` methods exposed by `preload.ts`, which proxy to IPC handlers.

## Key File Locations

| Path | Purpose |
|------|---------|
| `electron/main.ts` | Electron window, app lifecycle |
| `electron/preload.ts` | `window.api` context bridge definition |
| `electron/ipc/handlers.ts` | IPC channel routing to services |
| `electron/services/qaPairService.ts` | Archive `.md` file CRUD |
| `electron/services/threadService.ts` | `threads.json` CRUD |
| `electron/services/searchService.ts` | Full-text and tag search |
| `electron/services/import/` | Shared-link conversation import (ChatGPT/Gemini/Copilot) |
| `electron/services/settingsService.ts` | `settings.json` load/save |
| `electron/services/pathResolver.ts` | Data directory resolution |
| `electron/services/logger.ts` | Dev-only logging (Electron side) |
| `src/App.vue` | Root component, layout, app-level events |
| `src/components/ThreadsPanel.vue` | Left column — thread list |
| `src/components/QAListPanel.vue` | Middle column — QA list with search |
| `src/components/QAContentPanel.vue` | Right column — QA viewer/editor |
| `src/components/QAEditor.vue` | Modal dialog for creating new QA |
| `src/components/SharedLinkImportDialog.vue` | Modal dialog for importing a shared conversation link |
| `src/components/QAEditForm.vue` | Inline form for editing existing QA |
| `src/components/QAMetadataBar.vue` | Metadata display (source, tags, date) |
| `src/components/MarkdownRenderer.vue` | Markdown + syntax highlighting |
| `src/components/SettingsDialog.vue` | Data directory settings modal |
| `src/stores/threadStore.ts` | Thread state (Pinia) |
| `src/stores/qaStore.ts` | QA pair state (Pinia) |
| `src/stores/uiStore.ts` | UI state: search, sort, dark mode |
| `src/types/QAPair.ts` | `QAPairData`, `QACreateData`, `QAUpdateData` |
| `src/types/Thread.ts` | `ThreadData`, `ThreadMap` |
| `src/global.d.ts` | `window.api: ElectronAPI` type declaration |
| `src/utils/logger.ts` | Dev-only logging (renderer side) |
| `src/assets/styles/main.css` | Global CSS, dark mode variables |
| `vite.config.ts` | Vite + vite-plugin-electron config |
| `vite.config.server.ts` | Config variant for VS Code debugger |
| `electron-builder.yml` | Native packaging config |

## Data Model

**QA Pairs** are stored as Markdown files with YAML frontmatter:
- Location: `<dataDirectory>/archive/*.md`
- Filename: `YYYYMMdd_HHMM_00_<source>_<questionWords>.md`
- ID format: `YYYYMMdd_HHMM` (timestamp-based, unique)

```markdown
---
id: '20260204_2135'
title: My Title
source: claude          # claude | chatgpt | copilot | grok | gemini | manual | other | lens
url: https://...
tags: [tag1, tag2]
timestamp: '2026-02-04T21:35:57.826479'
version: 1
thread_pairs: []
question: The question text (single-line or YAML block scalar for multi-line)

# Machine-generated metadata (optional)
ai_topic: gradient descent
ai_concepts: [backprop, loss, optimization]
ai_status: open | closed | speculative | dead-end
ai_confidence: speculative | working | confident | validated
ai_summary: Brief summary of conclusion
---

The answer is the unrestricted Markdown body — any headings, code blocks, tables, or formatting are valid.
```

**Format rules:**
- `question` lives in YAML frontmatter. Multi-line questions use a `|-` block scalar.
- The answer is the full document body after `---` — no `## Question` / `## Answer` wrappers.
- A bare `---` line inside `question` would conflict with YAML frontmatter; the app replaces it with `<hr>` on write.
- Legacy files using `## Question` / `## Answer` body markers are still parsed as a read-only fallback.

**Threads** are stored in `<dataDirectory>/threads.json`:
```json
{
  "thread_20260210_123456": {
    "name": "Thread Name",
    "items": ["20260204_2135", "20260205_1845"]
  }
}
```

Thread IDs: `thread_YYYYMMdd_HHMMSS`

## IPC API (`window.api`)

All renderer↔main communication uses `ipcRenderer.invoke()` / `ipcMain.handle()`.

| Method | Returns | Description |
|--------|---------|-------------|
| `settingsLoad()` | `AppSettings` | Load settings.json |
| `settingsSave(s)` | `void` | Save settings.json |
| `settingsPickDirectory()` | `string\|null` | Open folder picker dialog |
| `threadsLoad()` | `ThreadMap` | Load threads.json |
| `threadsSave(t)` | `void` | Save threads.json |
| `qaListAll()` | `Record<string, QAPairData>` | Load all archive .md files |
| `qaGet(id)` | `QAPairData\|null` | Load single .md file |
| `qaCreate(data)` | `QAPairData` | Create new .md file |
| `qaUpdate(id, data)` | `QAPairData` | Update .md file, increment version |
| `qaDelete(id)` | `void` | Delete .md file |
| `searchQuery(q, type)` | `string[]` | Full-text or tag search, returns IDs |
| `importSharedLink(url)` | `SharedImportResult` | Import a shared LLM conversation (ChatGPT/Gemini/Copilot) as QA pairs |
| `onMenuAction(cb)` | `() => void` | Subscribe to native-menu clicks (main → renderer `menu-action`); returns an unsubscribe fn |

## Command Exposure (palette + menu)

Every end-user action lives in one registry: **`appCommands`** in `src/App.vue`
(`{ id, label, shortcut, run }`). It feeds both the **command palette** and the native
**application menu**:

- The menu is built in `electron/main.ts` (`createApplicationMenu`). App-specific items call
  `mainWindow.webContents.send('menu-action', '<id>')` — they carry **no accelerators** (the
  shortcut is a display hint only), so keyboard handling stays solely in `handleGlobalKeydown`.
- `preload.ts` exposes `onMenuAction`; `App.vue` maps the incoming id back to `appCommands[].run`.
- Cross-component actions use the existing `llm:*` window-event pattern (e.g. `llm:new-thread`,
  `llm:show-all-qas`, `llm:import-shared-link`), with listeners in the owning component.

**When adding a user action:** add it to `appCommands` (palette + menu-dispatch), add a menu item
in `main.ts`, and — only for high-traffic actions — a toolbar/context button.

## Shared-Link Import

`electron/services/import/` turns a **shared conversation URL** into QA pairs + a thread.
The renderer (`SharedLinkImportDialog.vue` → `App.vue`) creates the pairs and thread from the
returned `SharedImportResult`, mirroring the file-import flow.

- **ChatGPT** — JSON from `chatgpt.com/backend-api/share/<id>` (walks the `mapping` tree).
- **Copilot** — JSON from `copilot.microsoft.com/c/api/conversations/shares/<id>` (sorted by `createdAt`).
- **Gemini** — no server JSON; rendered in a hidden `BrowserWindow` and extracted from the DOM.

Transport uses Electron's `net` module (Chromium stack — Node `fetch` overflows on Google's
headers). Provider parsers are **pure** (no Electron/FS) and unit-tested. The thread + every QA
are tagged with the provider and model name; if no title is found, the thread name is derived
from the first question and the UI reminds the user to rename it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript (strict mode) |
| Desktop Shell | Electron 33 |
| Build Tool | Vite 5 + vite-plugin-electron |
| State Management | Pinia 2 |
| Component Library | PrimeVue 4 (Aura theme) |
| Markdown Rendering | markdown-it + highlight.js |
| Frontmatter Parsing | gray-matter |
| Native Packaging | electron-builder |
| Testing | Vitest |

## Development Workflow

```bash
npm install          # Install dependencies
npm run dev          # Start Electron app in dev mode (hot-reload)
npm run typecheck    # TypeScript type check
npm run lint         # ESLint with auto-fix
npm run test         # Run Vitest tests
npm run build        # Production build
npm run electron:build  # Build native installer
```

For VS Code debugging: see BUILD.md. Use the **"Full Stack: Backend + Renderer"** compound launch config.

Default ports: `5173` (Vite), `9223` (Electron/Node debugger).

## Known Issues / Technical Debt

Issues noted during initial inspection (do not fix without explicit request):

1. **No optimistic UI / loading states** — all IPC calls are awaited silently; no spinners or loading indicators shown during file I/O.

2. **`qaListAll()` loads every file on every call** — there is no in-memory cache or incremental loading. Could be slow with large archives.

3. **Search is in-process and naïve** — `searchService.ts` iterates all pairs on every search; no indexing. Will not scale.

4. **No unit tests yet** — `vitest` is configured but no tests exist.

5. **Data directory defaults to CWD in dev** — this can be confusing; the archive and settings files appear mixed in the project root during development.

6. **`moveInThread` moves only ±1 at a time** — no drag-and-drop reordering implemented yet.

7. **`version` field in QA frontmatter** is incremented on every `qaUpdate()` but is not displayed in the UI beyond the metadata bar; no version history or diffing.

8. **No confirmation on destructive operations from keyboard** — only mouse-click delete has a confirmation dialog.

## Planned Enhancements (Future Work)

Per the project owner's stated roadmap:
- Better LLM integration (auto-import from chats)
- Thread hierarchies / nesting
- Better search (vector indexing, semantic search)
- Anthropic provider implementation
- Enhanced markdown editor
- Import/export formats
