# LLM Aggregator - Local-First Q&A Archive for LLM Conversations

LLM Aggregator is a desktop app for collecting and organizing high-value Q&A content from LLM chats.

The core idea is simple: your archive should outlive any individual chat product. Instead of relying on vendor session history, you store your own portable files, edit them freely, and structure them into reusable knowledge threads.

Built with Vue 3, TypeScript, Electron, and PrimeVue.

---

## Table of Contents

1. [What This Project Does](#what-this-project-does)
2. [Design Goals](#design-goals)
3. [High-Level Architecture](#high-level-architecture)
4. [Data Flow: From UI to Disk](#data-flow-from-ui-to-disk)
5. [Core User Workflows](#core-user-workflows)
6. [Structured Paste and Batch Creation](#structured-paste-and-batch-creation)
7. [Export and Import](#export-and-import)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Getting Started](#getting-started)
10. [Build, Test, and Script Reference](#build-test-and-script-reference)
11. [UI Testing Guide (Playwright)](#ui-testing-guide-playwright)
12. [Debugging in VS Code](#debugging-in-vs-code)
13. [Building Native Installers](#building-native-installers)
14. [Runtime Configuration](#runtime-configuration)
15. [Data Model and File Format](#data-model-and-file-format)
16. [Claude Desktop MCP Integration](#claude-desktop-mcp-integration)
17. [Project Structure](#project-structure)
18. [Technology Stack](#technology-stack)
19. [Generative AI Usage](#generative-ai-usage)
20. [Contributing](#contributing)
21. [Credits](#credits)
22. [License](#license)

---

## What This Project Does

LLM Aggregator lets you build a curated, editable archive of question-answer pairs.

Typical flow:

1. Copy selected Q&A content from an LLM chat.
2. Save it as a local QA entry (Markdown file with metadata).
3. Group related entries into threads.
4. Search, reorder, refine, and reuse over time.

Unlike vendor chat history, this archive is intentionally independent, transparent, and durable.

---

## Design Goals

- Local-first ownership of data.
- Human-readable storage, no database lock-in.
- Fast QA creation during high-throughput capture sessions.
- Low-friction editing and reordering.
- Predictable behavior with minimal hidden automation.

---

## High-Level Architecture

The app uses Electron's split process model.

```text
Renderer (Vue 3 / Chromium)              Main Process (Electron / Node)
----------------------------------       ----------------------------------
src/                                     electron/
  App.vue                                  main.ts
  components/                              preload.ts
  stores/                                  ipc/handlers.ts
                                           services/*.ts

Renderer -> window.api.* -> preload bridge -> IPC handlers -> services -> filesystem
```

Important boundary:

- Renderer handles UI/state only.
- Main process handles filesystem access.
- Services under electron/services are the source of truth for persisted data behavior.

---

## Data Flow: From UI to Disk

When a user creates or edits a QA:

1. Renderer collects form state.
2. Renderer calls a method on window.api.
3. Preload forwards via ipcRenderer.invoke.
4. Main process handler validates/routs request.
5. Service reads or writes archive files.
6. Updated data is returned to renderer and reflected in Pinia stores.

This keeps file I/O centralized and keeps renderer logic testable and mostly pure UI/state.

---

## Core User Workflows

### Thread management

- Create, rename, and delete threads.
- Reorder items in thread context.
- Maintain deliberate narrative order for related QAs.

### QA lifecycle

- Create new entries from manual input or parsed paste.
- Edit question, answer, title, source, tags, and URL.
- Delete with confirmation.

### Search and retrieval

- Full-text search across QA content.
- Tag search for controlled recall.
- Sorting options for scanning by recency or title.

### Display and readability

- Three-panel layout: Threads, QA List, QA Content.
- Markdown rendering with syntax-highlighted code.
- Metadata bar for source context and provenance.

### Export and import

#### Export and import to/from a file
- Export any selected QA or thread to a portable Markdown file (Save As dialog).
- Import a previously exported file — or a hand-authored file — to recreate QA entries in the archive.
- Thread imports reconstruct the thread and item order automatically.
- Import always creates new records; existing content is never overwritten.
- Version mismatches are handled with best-effort parsing and a per-item warning summary.

#### Export  to a note
Same as a to a file, but targeting one note or section in a note repository app (OneNote or Apple Notes)

---

## Structured Paste and Batch Creation

The QA dialog supports multi-entry parsing for fast ingestion.

Behavior:

1. Paste structured text into Question field.
2. First parsed QA fills editor.
3. Remaining parsed QAs are queued.
4. Use Create Parsed Batch to commit all detected entries.

Supported format A (label blocks):

```text
Title: Shared title for this batch
Source: claude
URL: https://example.com/conversation/123
Tags: planning, ux, qa

Question: What is the objective of this feature?
Answer: It enables structured multi-QA paste and batch creation.

Question: Which button creates all parsed entries?
Answer: Use the Create Parsed Batch button.
```

Supported format B (Markdown sections):

```text
## Question
What is the objective of this feature?

## Answer
It enables structured multi-QA paste and batch creation.

## Question
Which button creates all parsed entries?

## Answer
Use the Create Parsed Batch button.
```

Parsing rules:

- Labels are case-insensitive.
- Optional shared metadata: Title, Source, URL, Tags.
- Tags are comma-separated.
- A QA is accepted only when both question and answer are present.

---

## Export and Import

### Exporting a QA pair

1. Select a QA in the list.
2. Click **Export** in the content panel toolbar, or press `X`.
3. A Save dialog opens. Choose a filename and location.
4. The file is written as a portable Markdown file and a success toast is shown.

### Exporting a thread

1. Hover over a thread in the Threads panel.
2. Click the download icon (Export) button that appears next to Rename and Delete.
3. Alternatively, select the thread and press `X` with no QA selected.
4. A Save dialog opens. The file contains all thread QAs in order, plus thread metadata.

### Importing

1. Press `Ctrl+O` (or `Cmd+O` on macOS), or choose **Import from File** from the command palette.
2. An Open dialog opens. Select a `.md` file.
3. After import:
   - A toast confirms how many QAs were created.
   - If warnings were detected (missing fields, version mismatch, no file header), an import summary dialog lists each issue per-item.
   - If the file contains a thread, the thread is reconstructed with items in their original order.

### Export file format

Exported files are standard Markdown with a YAML frontmatter header:

```markdown
---
writer_app: llm-aggregator
writer_version: 1.0.0
schema_version: 1
exported_at: 2026-03-15T12:00:00.000Z
export_type: qa        # or: thread
---

title: My Question Title
source: claude
url: https://claude.ai/chat/abc123
tags: typescript, electron
version: 3
original_id: 20260204_2135
original_timestamp: 2026-02-04T21:35:57.826Z

## Question

Question text here.

## Answer

Answer text here.
```

Thread files include a `thread_name` header field and separate QA blocks with `---` dividers.

### Human-authored import files

Files without a YAML header are accepted. The parser uses the same flexible rules as the structured-paste feature:

- `## Question` / `## Answer` Markdown headings.
- Or `q: ...` / `a: ...` inline labels.
- Per-QA metadata lines (`title:`, `source:`, `tags:`, etc.) before the first `## Question` are optional.

Missing fields are filled with safe defaults and listed in the import summary.

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| Ctrl/Cmd+F or / | Focus search | Global |
| Ctrl/Cmd+N | Create new QA | Global |
| Ctrl/Cmd+S | Save current edit | Edit mode |
| Ctrl/Cmd+, | Open settings | Global |
| Escape | Close dialog or cancel | Global |
| F2 | Rename selected thread | Global |
| Alt+Up / Alt+Down | Move selected QA | Thread mode |
| E | Edit selected QA | Global |
| Delete | Delete selected QA (with confirmation) | Global |
| D | Duplicate selected QA into new form | Global |
| X | Export selected QA or thread to file | Global |
| Ctrl/Cmd+O | Import from file | Global |
| Ctrl/Cmd+K | Open command palette | Global |
| ? | Show keyboard help | Global |
| Ctrl/Cmd+Enter | Submit form | QA editor |
| Arrow Up / Down | Navigate lists | Thread or QA list |

---

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- VS Code extension Vue - Official (vue.volar) for Vue breakpoint/debug support

### Install and run

```bash
npm install
npm run dev
```

This starts the Vite server and launches Electron with hot reload.

Default data location:

- Development: current working directory
- Packaged app: OS user-data directory

You can switch data directory from Settings inside the app.

---

## Build, Test, and Script Reference

| Command | Description |
|---------|-------------|
| npm run dev | Start Vite + Electron (hot reload) |
| npm run dev:server | Start Vite server only |
| npm run build | Typecheck + production build |
| npm run typecheck | Type check only |
| npm run lint | ESLint with auto-fix |
| npm run test | Run Vitest once |
| npm run test:watch | Run Vitest watch mode |
| npm run test:e2e | Run Electron Playwright tests |
| npm run test:e2e:debug | Playwright debug mode |
| npm run test:e2e:ui | Playwright UI mode |
| npm run test:e2e:report | Open Playwright report |
| npm run test:visual | Run visual regression suite |
| npm run test:visual:update | Intentionally update snapshots |
| npm run electron:build | Build installer for current platform |
| npm run electron:build:win | Build Windows installer |
| npm run electron:build:mac | Build macOS artifacts |
| npm run electron:build:linux | Build Linux artifacts |

Playwright note:

- End-to-end runs use an isolated temporary data directory fixture.
- Use snapshot updates only for intentional visual changes.

Targeted run examples:

```bash
bash scripts/playwright-electron.sh tests/e2e/merged-features.spec.ts
bash scripts/playwright-electron.sh --grep "supports collapse controls"
```

---

## UI Testing Guide (Playwright)

Use these scripts from package.json for the standard UI testing workflow:

1. Run all Electron UI tests:

```bash
npm run test:e2e
```

2. Run in inspector/debug mode when a test fails:

```bash
npm run test:e2e:debug
```

3. Use Playwright UI mode for local triage:

```bash
npm run test:e2e:ui
```

4. Open the HTML report from the last run:

```bash
npm run test:e2e:report
```

Visual regression checks:

```bash
npm run test:visual
```

Update snapshots only when a UI change is intentional:

```bash
npm run test:visual:update
```

Recommended day-to-day order:

1. Run test:e2e after feature changes.
2. If visual failures are expected and intentional, run test:visual:update.
3. Re-run test:e2e to confirm green state.

Notes:

- npm scripts are the canonical, cross-platform entrypoints for this repo.
- The helper script scripts/playwright-electron.sh is useful for targeted runs.
- Electron tests are isolated from your real archive data via a temp fixture.

---

## Debugging in VS Code

### Frontend-only mode

Use when changing renderer UI without native API dependencies.

```bash
npm run dev:server
```

Then launch Chrome Launch Frontend or Edge Launch Frontend.

### Full-stack mode (recommended)

Use the compound launch configuration:

- Full Stack: Backend + Renderer

This starts:

1. Vite server
2. Electron main process debug session
3. Renderer debug attachment

Ports:

- Vite: 5173
- Electron Node debugger: 9223

---

## Building Native Installers

Build for host platform:

```bash
npm run electron:build
```

Build specific platforms:

```bash
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

Expected artifact families:

- Windows: NSIS installer and portable executable
- macOS: DMG and ZIP
- Linux: AppImage and DEB

Cross-platform packaging can require host-specific signing/toolchain setup.

---

## Runtime Configuration

App settings are stored in settings.json.

Example:

```json
{
  "dataDirectory": "/path/to/your/data"
}
```

Runtime directory layout:

```text
<dataDirectory>/
  settings.json
  threads.json
  archive/
    *.md
```

---

## Data Model and File Format

### Threads

threads.json stores thread names and ordered QA IDs.

```json
{
  "thread_20260210_123456": {
    "name": "Thread Name",
    "items": ["20260204_2135", "20260205_1845"]
  }
}
```

### QA entries

Each QA is one Markdown file in archive with YAML frontmatter.

```markdown
---
id: '20260204_2135'
title: Example Title
source: claude
url: https://example.com/chat/123
tags:
  - research
  - notes
timestamp: '2026-02-04T21:35:57.826479'
version: 1
thread_pairs: []
---

## Question
What is the meaning of life?

## Answer
42
```

Why this format works well:

- Human-readable and diff-friendly
- Easy to back up and sync
- No schema lock to proprietary systems

---

## LLM Lens Setup

1. Open **Settings** → **AI** tab
2. Enter your OpenAI API key
3. Select a model (`gpt-4o` recommended; `gpt-4o-mini` for lower cost)
4. Click **Test Connection**
5. Click **Generate All Embeddings** to index your archive
6. Open the **LLM Lens** panel (`Ctrl/Cmd+L`) and start querying

Embeddings are cached locally in `<userData>/embeddings.json` and recomputed only when a QA pair changes.

---

## Claude Desktop MCP Integration

To expose saved conversations to Claude Desktop via MCP:

1. Use files under build/claude/claude-conversation-mcp.
2. Configure server path and target archive directory in index.js.
3. Use build/claude/config/claude_desktop_config.json as a config template.

Current status: manual setup, planned future automation.

---

## Project Structure

```text
.
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/handlers.ts
│   └── services/
├── src/
│   ├── App.vue
│   ├── components/
│   ├── stores/
│   ├── types/
│   └── assets/styles/main.css
├── tests/
│   ├── e2e/
│   └── visual/
├── scripts/
├── vite.config.mts
├── vite.config.server.mts
├── electron-builder.yml
└── package.json
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| UI Framework | Vue 3 (Composition API, script setup) |
| Language | TypeScript |
| Desktop Shell | Electron |
| Build Tool | Vite + vite-plugin-electron |
| State Management | Pinia |
| Component Library | PrimeVue 4 |
| Markdown Rendering | markdown-it + highlight.js |
| Frontmatter Parsing | gray-matter |
| Testing | Vitest + Playwright |
| Packaging | electron-builder |

---

## Generative AI Usage

Project requirements and specifications were prepared manually.
The baseline implementation was produced in large part with Claude Opus 4.6 under human-guided planning and review.

---

## Contributing

- Keep changes focused.
- Preserve compatibility of threads.json and archive/*.md.
- Validate before opening a PR:

```bash
npm run typecheck
npm run build
npm run test
```

- Add tests for behavior changes.

---

## Credits

- Developer and maintainer: sadovskyvlad@gmail.com
- Original idea and conceptual model: eveselov@hotmail.com

---

## License

MIT. See LICENSE.md.
