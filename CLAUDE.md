# CLAUDE.md — LLM Aggregator

Context for Claude Code when working on this project.

## Project Summary

**LLM Aggregator** is a local-first Electron + Vue 3 desktop app for archiving and organizing Q&A pairs copied from LLM conversations (Claude, ChatGPT, Copilot, Grok, etc.). The key design philosophy: the archive is fully editable and offline — no sync with original LLM sessions. Users can create, edit, merge, split, and manually write QA pairs, and group them into "threads" (ordered, reorderable lists).

**Authors:**  Vlad Sadovsky (`sadovskyvlad@gmail.com`) 


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
| `electron/services/import/` | Shared-link conversation import (Claude/ChatGPT/Gemini/Copilot) |
| `electron/services/import/archive/` | Bulk account-export import (zip/folder/json → many threads) |
| `electron/services/import/archive/formatRegistry.ts` | Structure-based vendor-format sniffing |
| `electron/services/import/archive/archiveReader.ts` | Reads a .zip / folder / bare file, by entry basename |
| `electron/services/import/archive/bulkImportService.ts` | Preview → commit orchestration + progress |
| `electron/services/duplicateService.ts` | Dedup index (`origin_id`) + archive-wide duplicate sweep |
| `electron/services/settingsService.ts` | `settings.json` load/save |
| `electron/services/secretsService.ts` | API key storage entry point (chain wiring, startup sweep) |
| `electron/services/secrets/secretResolver.ts` | Precedence chain, partial save, status projection |
| `electron/services/secrets/secretBackendTypes.ts` | `SecretBackend` contract, error taxonomy, masking |
| `electron/services/secrets/backends/` | `env` (dev override) and `safe-storage` (OS-encrypted) backends |
| `electron/services/secrets/legacyCleanup.ts` | Renames legacy plaintext `secrets.json` aside on startup |
| `electron/services/llm/providerRegistry.ts` | Provider catalog (id, kind, capabilities) |
| `electron/services/llm/modelCatalogService.ts` | Model discovery + cache + curated fallbacks |
| `electron/services/llm/anthropicProvider.ts` | Anthropic completions provider |
| `electron/services/pathResolver.ts` | Data directory resolution |
| `electron/services/logger.ts` | Dev-only logging (Electron side) |
| `src/App.vue` | Root component, layout, app-level events |
| `src/components/ThreadsPanel.vue` | Left column — thread list |
| `src/components/QAListPanel.vue` | Middle column — QA list with search |
| `src/components/QAContentPanel.vue` | Right column — QA viewer/editor |
| `src/components/QAEditor.vue` | Modal dialog for creating new QA |
| `src/components/SharedLinkImportDialog.vue` | Modal dialog for importing a shared conversation link |
| `src/components/BulkImportDialog.vue` | Account-export preview / selection / progress / summary |
| `src/components/DuplicateCleanupDialog.vue` | Archive-wide duplicate sweep (Tools menu) |
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

# Import identity (optional, set by importers only)
origin_id: claude:<conversation_uuid>:<first_message_uuid>
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
| `secretsLoad()` | `SecretsStatus` | Key **presence, masked preview, provenance** — never key values |
| `secretsSave(updates)` | `SecretsStatus` | Save a **partial** update; omitted keys keep stored values |
| `secretsRecheck()` | `SecretsStatus` | Re-probe backend availability |
| `secretsDevEnvVarNames()` | `string[]` | Env var names the dev override reads |
| `aiListProviders()` | `ProviderDescriptor[]` | Available LLM providers and their capabilities |
| `aiListModels(id, force?, keyOverride?)` | `ModelCatalogResult` | Model catalog (api / cache / static) |
| `importSharedLink(url)` | `SharedImportResult` | Import a shared LLM conversation (Claude/ChatGPT/Gemini/Copilot) as QA pairs |
| `importFromFile()` | `FileImportOutcome\|null` | **Union**: `{kind:'markdown'}` for a .md export, `{kind:'archive'}` for an account export preview |
| `importArchiveCommit(id, sel)` | `BulkImportCommitResult` | Write the selected conversations; streams `archive-import:progress` |
| `importArchiveCancel(id)` | `void` | Release an uncommitted preview held in main |
| `onArchiveImportProgress(cb)` | `() => void` | Subscribe to bulk-import progress; returns an unsubscribe fn |
| `duplicatesScan()` | `DuplicateScanResult` | Archive-wide duplicate groups (proposal only, deletes nothing) |
| `duplicatesDelete(ids)` | `DuplicateCleanupResult` | Delete the given pairs and purge them from threads |
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

- **Claude** — JSON from `claude.ai/api/chat_snapshots/<id>` (`chat_messages[]`, ordered by `index`).
  The endpoint 403s without a browser `User-Agent`; `fetchJson` already sends one.
- **ChatGPT** — JSON from `chatgpt.com/backend-api/share/<id>` (walks the `mapping` tree).
- **Copilot** — JSON from `copilot.microsoft.com/c/api/conversations/shares/<id>` (sorted by `createdAt`).
- **Gemini** — no server JSON; rendered in a hidden `BrowserWindow` and extracted from the DOM.

Transport uses Electron's `net` module (Chromium stack — Node `fetch` overflows on Google's
headers). Provider parsers are **pure** (no Electron/FS) and unit-tested. The thread + every QA
are tagged with the provider and model name; if no title is found, the thread name is derived
from the first question and the UI reminds the user to rename it. Claude snapshots expose no
model identifier, so Claude imports carry the `claude` tag only.

**Fragility — expect breakage.** Every endpoint above is private, undocumented, and unversioned.
Vendors change payload shapes and tighten bot detection without notice, so importers rot. When
one breaks:

- The blast radius is **one provider**. Detection, `pairMessages`, `buildResult`, and the IPC/UI
  layer are shared and provider-agnostic — fix the parser in `parsers/`, and at most the endpoint
  URL in `sharedLinkImportService.ts`.
- **Capture the failing payload as a fixture** in `tests/unit/sharedLinkImport.test.ts` before
  changing parser logic. Every parser is pure precisely so this is cheap.
- Parsers **drop what they don't recognize** rather than throwing — good for resilience, but a
  newly-added content-block or turn type disappears silently. Prefer adding a warning to
  `ParsedConversation.warnings` over dropping unknown-but-visible content.
- If a JSON endpoint starts returning 403/challenge pages, the escalation path is the
  hidden-`BrowserWindow` approach Gemini uses — load the share page, then `fetch` the API from
  inside that page's context (same-origin, real browser headers). The parser stays unchanged.
- The stable long-term answer is per-vendor **account data export** files (a supported format),
  not share links. Not implemented today.

## Bulk (Account Export) Import

`electron/services/import/archive/` turns a **vendor account export** into many threads at once.
It reuses the share-link pipeline wholesale — `ParsedConversation` → `pairMessages` → `buildResult`
— and only adds an envelope reader plus a format sniffer.

**One menu entry, two pipelines.** `File → Import from File` accepts `.md`, `.json`, and `.zip`.
`fileImportService.ts` forks on extension and returns a discriminated `FileImportOutcome`; the
renderer opens either the markdown summary or the bulk preview dialog. Users never classify their
own file.

**Detection keys on structure, never filename.** Claude, ChatGPT, and Gemini all ship a file named
`conversations.json` with unrelated shapes. `formatRegistry.ts` therefore receives the raw entry
**text** (not parsed JSON) — Copilot's export is CSV and Takeout can be HTML, so the contract must
not assume JSON. Adding a format = one registry entry + one pure parser + fixtures.

**Input shapes.** `archiveReader.ts` accepts the downloaded `.zip`, an unzipped folder, or the bare
conversations file. Entries are matched by **basename** (Claude's zip is flat; Takeout nests several
folders deep).

**A basename match is not identification.** A Google Takeout archive contains
`My Activity/<Product>/MyActivity.json` for *every* product — YouTube, Chrome, Search, Maps, Gemini
Apps — all identically named. Taking the first basename hit would import browser history. The
reader therefore takes an `accept` predicate (structural detection) and keeps trying candidates
until one is accepted, ordering by `pathHints` (`gemini apps`) so the likely entry is probed first.

**yauzl reads sequentially.** In `lazyEntries` mode an `Entry` handle is only valid for
`openReadStream` during its own `entry` event — handles cannot be stashed and read later. Reading
is therefore two passes (`listZipCandidates` then `fetchZipEntry`), each costing only a
central-directory read. Do not "optimize" this back into one pass.

**Writes happen in main, not the renderer.** A large export is thousands of file writes; routing
each through IPC would flood the bridge and make progress impossible. `bulkImportService.ts` holds
the full preview in a main-side map keyed by `previewId` and ships only counts to the renderer —
`summarizePreview` strips the pair bodies, which are megabytes.

**Two-phase by design.** `previewArchive()` is read-only; `commitArchiveImport()` writes and emits
progress. Per-pair failures are isolated — one unwritable file must not abandon a 500-conversation
import.

### Deduplication

`origin_id` (`<provider>:<conversationId>:<anchorMessageId>`) is stamped onto every imported pair
and persisted in frontmatter. The anchor is the pair's **first** message id, so the key survives
later turns being appended to the same conversation. A share link and an account export of the
same conversation produce **identical** keys — verified by test.

- `updatePair()` must carry `origin_id` through every edit. It is immutable identity, never
  regenerated.
- `duplicateService.ts` serves both uses: `buildOriginIndex()` for exact import-time skipping
  (the index is updated live during a commit, so duplicates *within* one import are caught too),
  and `findDuplicateGroups()` for the archive-wide sweep, which falls back to a normalized content
  fingerprint for pairs predating `origin_id`. The sweep only ever proposes; deletion needs an
  explicit id list.

### Provider support status

| Provider | Export | Status |
|----------|--------|--------|
| Claude | `conversations.json` in a zip | **Validated** against a real export (11 conversations → 109 pairs) |
| Gemini | Takeout `Gemini Apps/MyActivity.json` **or** `.html` | **Validated** against real exports of both variants (875 records each) |
| Copilot | Privacy-dashboard `copilot-activity-history.csv` | **Validated** against a real export (2613 rows → 375 threads, 1286 pairs) |
| ChatGPT | `conversations.json` (array of `mapping` trees) | Implemented by reusing `parseChatGPT`; `validated: false` until checked against a real file — the UI warns |

**Gemini Takeout is not threaded.** Takeout exports an *activity log*: each record is a standalone
prompt + response, and nothing links a follow-up to what preceded it. `geminiTakeout.ts` therefore
groups records by **UTC calendar day** — a stand-in for threads, not a reconstruction. Only
prompt-like verbs (`Prompted`, `Branched`, `Answered`) are imported; `Created` / `Used` / `Added` /
`Gave` are Canvas, upload, and feedback records with no response body. Response HTML goes through
the existing Turndown `htmlToMarkdown`.

`parseGeminiTakeout` handles **both variants** behind one entry — it sniffs JSON vs HTML itself:

- **JSON** (`safeHtmlItem[].html`, ISO `time`, `header: "Gemini Apps"`) is the better source and is
  probed first. Some records carry *several* html items — join them, do not take `[0]`.
- **HTML** must compare the header-cell product **exactly**; a substring test would accept a YouTube
  page that merely mentions Gemini.

Dedup keys are `<isoSeconds>#<djb2(prompt)>`:

- There are no message ids, and timestamps are *nearly* but not quite unique — 13 collisions in the
  JSON variant, 28 in the HTML one — hence the prompt hash.
- Milliseconds are **truncated** and days are **UTC** specifically so that the JSON and HTML exports
  of the same history produce identical keys and de-duplicate against each other. Changing either to
  local time silently breaks cross-variant dedup — there is a test pinning this.

The two variants do not yield identical counts: the JSON leaves `title` bare for image-only prompts
(8 in a real export) where the HTML carries filename text. Those are skipped and reported separately
from non-conversation records.

**Copilot CSV is threaded — reverse it, never sort it.** `copilotCsv.ts` reads the privacy-dashboard
export (`Conversation,Time,Author,Message`). Unlike Takeout it carries a real conversation title, so
threads are reconstructed rather than grouped by day, and message bodies are already Markdown.

Two facts make ordering subtle:

- Rows are **newest-first**, globally and within a conversation.
- **An AI row and the Human prompt that produced it share an identical timestamp** — 1290 of 2613
  rows in a real export tie with a sibling. Sorting ascending by time is therefore ambiguous *and
  wrong*: a stable sort preserves the file's AI-before-Human order inside each tie. The rows must be
  **reversed**. There is a test pinning this; do not "improve" it into a sort.

Message bodies are multi-line Markdown containing commas, quotes, and blank lines, so `parseCsvRows`
is a real RFC 4180 reader — a line-split would corrupt the data. The file is UTF-8 **with a BOM**.
There are no ids, so keys are `csv:<hash(title)>` + `<isoSeconds>#<hash(message)>`; the message hash
is what separates a prompt from its reply when their timestamps tie.

### Multi-select readiness

Every structure here is multi-conversation and every selection is an array
(`BulkImportSelection.threadSourceIds`, `deleteDuplicates(ids)`). Single-item flows are the
one-element case, so the planned multi-select export / re-import does not need a second set of
shapes.

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
- Enhanced markdown editor
- Import/export formats
- Robust detection of shared chats URLs (not based on hard match of the URL prefix)
Sequenced work in flight (see `doc/plans/`):
1. Secrets storage V1 Step 6 — migrate legacy keys instead of only orphaning them
2. Replace the hand-rolled Anthropic `fetch` client with `@anthropic-ai/sdk`
   (fixes `max_tokens`/`stop_reason` handling, timeouts, and token tracking)
3. Secrets storage V2 — key lifecycle controls, guided recovery, multi-provider namespace
