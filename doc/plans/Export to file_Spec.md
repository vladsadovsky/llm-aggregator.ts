# Spec: Export to file / Import from file

> **Superseded (2026-07-25).** Merged into
> [`Export_And_Interchange_Master_Spec.md`](./Export_And_Interchange_Master_Spec.md),
> which is the maintained source of truth for all export and interchange work.
>
> This document is retained for provenance. Chapter 1 below is the original
> human-authored requirement statement and is reproduced verbatim in the master spec
> §2.1; §2.2 there tracks compliance against it — including two requirements the
> shipped code does **not** currently meet (all stored metadata exported; full-fidelity
> round trip). Chapter 2's design is superseded by master spec §3–§5, which reflects
> what was actually built rather than what was planned.

## Chapter 1: Human articulation of an intended use case, requirements

There is a batch ingest feature currently, which operates on the text, pasted into question field, representing series of QA pairs, separated from each other by syntactic delimeters. 

I want to add persistence to the applicaiton by implementing import and export commands, operating on a thread or an individial QA pair. 

Export semantic is to use currently selected item, present a "Save As" type dialog, resulting in chosen by user fully qualified file name. Application then is supposed to save text content to the file, compatible with the format of the batch ingest feature with addition of necessary tags and thread name and other top level metadata, if thread is being exported. 

Each QA pair, exported, as a single, or as part of the thread, must contain all of the stored metadata.

Import semantic is reversed, file is selected, which contains single QA or a  thread of QAs. Content of the file may be previously saved by this application, although it may be different version of it OR it may be hand created by the human or an external app or agent, familiar with expected format. SPecific format of the imported items may be flexible within common choices - different delimeters or placement of tags, for example, so that regular human would understand the structure of what's being imported. 

At the header level file must be tagged with application writer metadata (in the case of the current application being a writer, that includes at least version). If no header is present, it is assumed that file is authored by the human. 

Requirements:
- round trip must work with full fidelity
- UI test scripts must be added and included as a part of comprehensive UI test 
- versions of saving application don't have to match, code must deal with the mismatch intelligently (whatever that may mean)
- Further details of the design, implementation, testing must go into this file, but follow up section. AI agent is not expected to change human authored section
- architectural requirement for the code organization is to prepare for the future features exporting to non file (like OneNote), where similar format may be used to export content into a note. 

Note for AI agent: 
- after the document is read, reverse briefing session is required, presenting clarification questions to the human author. Answers to questions from this session will guide formulation of the architecture and implementation.

---

## Chapter 2: Design and Architecture

*This chapter is AI-authored based on the reverse briefing session held 2026-03-15. The human-authored Chapter 1 is preserved unmodified above.*

### 2.1 Locked Decisions

| # | Decision |
|---|----------|
| 1 | Scope: both selected QA and selected thread are supported from initial release. |
| 2 | Format: Markdown only. File structure uses Markdown heading delimiters and YAML frontmatter — no JSON or YAML-first format. |
| 3 | Export delimiter: reuse existing batch-ingest delimiter convention (`## Question` / `## Answer` h2 headers). Export output is deterministic. |
| 4 | File header fields (mandatory when app is the writer): `writer_app`, `writer_version`, `schema_version`, `exported_at`, `export_type` (`qa` or `thread`), `thread_name` (thread exports only). |
| 5 | Per-QA metadata: all stored fields exported per QA block; original ID and original timestamp preserved as auxiliary fields `original_id` and `original_timestamp`. |
| 6 | Import identity: IDs and `timestamp` are always regenerated on import (new records every time, no overwrite). `original_id` and `original_timestamp` are carried into the imported QA as auxiliary frontmatter for reference. |
| 7 | Conflict policy: always create new items — importing duplicate logical content never overwrites existing records. |
| 8 | Version mismatch: best-effort import with non-blocking warnings. Import proceeds; each item-level anomaly is reported in a per-item summary dialog. |
| 9 | Import warnings UX: toast notification (success/warning severity) + a summary dialog listing per-item details after the import completes. |
| 10 | UX entry points: toolbar/menu actions, right-click context menu, and keyboard shortcuts. |
| 11 | Keyboard shortcuts: `X` — export active selection (QA has priority; falls back to active thread); `Ctrl+O` — import from file. Both revisable after user feedback. |
| 12 | Testing scope: Playwright happy-path UI flows only in initial release. |

### 2.2 Canonical File Format

#### 2.2.1 File header

Every app-produced file begins with YAML frontmatter (standard Markdown convention). This block is absent or partial for human-authored files; absence triggers the "human-authored" import path.

```markdown
---
writer_app: llm-aggregator
writer_version: 1.2.3
schema_version: 1
exported_at: 2026-03-15T12:00:00.000Z
export_type: qa
---
```

For thread exports, add:

```yaml
export_type: thread
thread_name: My Thread Name
```

#### 2.2.2 Single QA export file

Per-QA metadata is placed as `key: value` lines immediately before the `## Question` heading. This mirrors the existing batch-ingest shared-meta convention, extended to per-block scope. The import parser reads per-block metadata from lines preceding `## Question` within each split block.

```markdown
---
writer_app: llm-aggregator
writer_version: 1.2.3
schema_version: 1
exported_at: 2026-03-15T12:00:00.000Z
export_type: qa
---

title: My Question Title
source: claude
url: https://claude.ai/chat/abc123
tags: typescript, electron
original_id: 20260204_2135
original_timestamp: 2026-02-04T21:35:57.826479
version: 3

## Question

Question content here.

## Answer

Answer content here.
```

#### 2.2.3 Thread export file

QA blocks are separated by `---` (Markdown horizontal rule). Thread metadata lives in the file header only.

```markdown
---
writer_app: llm-aggregator
writer_version: 1.2.3
schema_version: 1
exported_at: 2026-03-15T12:00:00.000Z
export_type: thread
thread_name: My Thread Name
---

title: First QA Title
source: claude
url: https://claude.ai/chat/abc123
tags: typescript
original_id: 20260204_2135
original_timestamp: 2026-02-04T21:35:57.826479
version: 2

## Question

First question text here.

## Answer

First answer text here.

---

title: Second QA Title
source: chatgpt
url:
tags: electron, vue
original_id: 20260205_1845
original_timestamp: 2026-02-05T18:45:00.000Z
version: 1

## Question

Second question text here.

## Answer

Second answer text here.
```

#### 2.2.4 Import flexibility

The import parser is tolerant of:
- Missing file header (treated as human-authored; warnings added per item).
- `schema_version` or `writer_version` mismatch (best-effort parsed; warnings added).
- Alternative `## question` / `## answer` capitalisation or single-hash `#` headers (already handled by existing regex).
- Inline delimiters (`q: ... a: ...`) in lieu of headers (already handled by existing regex).
- Missing per-QA metadata fields (filled with defaults: empty string or empty array).
- `---` block separator absent in single-QA files (treated as one QA block).

### 2.3 Architecture

#### 2.3.1 Module boundaries

The architectural requirement (prepare for non-file export targets) is met by separating format logic from transport logic:

```
electron/services/
  qaExportFormatService.ts   ← serialise QAs/threads → string (pure, no FS)
  qaImportFormatService.ts   ← parse string → ImportResult (pure, no FS)
  fileExportService.ts       ← show save dialog, write file (file transport)
  fileImportService.ts       ← show open dialog, read file (file transport)
```

A future OneNote or clipboard target would only implement a new transport wrapper and call the same format services.

`ImportResult` shape:

```typescript
type ImportedQA = {
  data: QACreateData
  warnings: string[]       // per-item anomalies
  originalId: string
  originalTimestamp: string
}

type ImportResult = {
  exportType: 'qa' | 'thread'
  threadName?: string
  items: ImportedQA[]
  fileWarnings: string[]   // file-level anomalies (header missing, version mismatch)
}
```

#### 2.3.2 IPC contract additions

New channels added to `electron/ipc/handlers.ts` and exposed through `electron/preload.ts`:

| IPC channel | Direction | Description |
|-------------|-----------|-------------|
| `export:qa` | renderer → main | Show save dialog, write current QA to file |
| `export:thread` | renderer → main | Show save dialog, write current thread to file |
| `import:file` | renderer → main | Show open dialog, parse file, return `ImportResult` |

`window.api` additions in `src/global.d.ts`:

```typescript
exportQA: (id: string) => Promise<{ savedPath: string } | null>
exportThread: (threadId: string) => Promise<{ savedPath: string } | null>
importFromFile: () => Promise<ImportResult | null>
```

#### 2.3.3 Renderer flow

Export:
1. User triggers export (toolbar button / context menu / `X` key).
2. Active selection determines handler: QA id → `window.api.exportQA(id)`; thread id with no QA selected → `window.api.exportThread(threadId)`.
3. Main process shows Save dialog, writes file, returns saved path or `null` (user cancelled).
4. Success: toast with saved filename. Cancelled: silent.

Import:
1. User triggers import (toolbar button / context menu / `Ctrl+O`).
2. Renderer calls `window.api.importFromFile()`.
3. Main process shows Open dialog, reads file, parses via `qaImportFormatService`, returns `ImportResult` or `null`.
4. Renderer calls `qaStore.createPair()` for each item in result, using regenerated ID/timestamp.
5. If `export_type === 'thread'`, renderer calls `threadStore.createThread()` with `thread_name` and the newly created IDs in order.
6. Post-import: toast (`success` or `warn` severity based on whether warnings present) + summary dialog listing per-item details (skipped fields, version notes, etc.).

#### 2.3.4 Suggested default path for save dialog

For QA export: `{title-slug}_{date}.md` in the user's last-used export directory (or home if first time).
For thread export: `thread_{thread-name-slug}_{date}.md`.

### 2.4 Implementation Steps

Phases are ordered by dependency. Steps within a phase are independent and can be parallelised.

**Phase 1 — Format and service layer**
1. Implement `electron/services/qaExportFormatService.ts` — serialise `QAPairData` → export string and `ThreadData` + `QAPairData[]` → export string.
2. Implement `electron/services/qaImportFormatService.ts` — parse file string → `ImportResult` with per-item warnings.
3. Implement `electron/services/fileExportService.ts` — Save dialog + file write.
4. Implement `electron/services/fileImportService.ts` — Open dialog + file read.
5. Add `original_id?: string` and `original_timestamp?: string` optional fields to `QAPairData` in `src/types/QAPair.ts` and propagate to frontmatter read/write in `electron/services/qaPairService.ts`.

**Phase 2 — IPC wiring**
6. Register `export:qa`, `export:thread`, `import:file` in `electron/ipc/handlers.ts`.
7. Expose `exportQA`, `exportThread`, `importFromFile` in `electron/preload.ts`.
8. Update `ElectronAPI` interface in `src/global.d.ts`.

**Phase 3 — UI integration**
9. Add export action to `src/components/QAContentPanel.vue` (button near delete/edit row).
10. Add export action to `src/components/ThreadsPanel.vue` (per-thread context action).
11. Add import command to `src/App.vue` toolbar (or command palette entry).
12. Register `X` and `Ctrl+O` shortcuts in `handleGlobalKeydown` in `src/App.vue`.
13. Implement import summary dialog component (re-use PrimeVue `Dialog` + table of per-item results).

**Phase 4 — Tests**
14. Add `tests/e2e/export-import.spec.ts` with happy-path flows (see §2.5).

### 2.5 Test Plan

File: `tests/e2e/export-import.spec.ts`

| Test | Description |
|------|-------------|
| `exports single QA to file` | Create QA → trigger export → verify file exists, contains YAML header with all required fields, contains full QA metadata. |
| `imports single QA from file` | Place pre-authored export file in dataDir → trigger import → verify QA appears in list, title/content/source/tags match, id is new. |
| `exports thread to file` | Create thread with 2 QAs → trigger thread export → verify file has `export_type: thread`, `thread_name`, and 2 QA blocks in order. |
| `imports thread from file` | Place pre-authored thread export file → trigger import → verify thread is created with name and 2 items in correct order. |
| `import preserves original_id and original_timestamp as auxiliary` | Import a file with known `original_id` values → inspect created QA → verify `original_id` and `original_timestamp` stored, new `id` is different. |
| `import shows summary dialog with warnings for missing header` | Import a human-authored file (no YAML header) → verify toast appears with warning severity, summary dialog opens and lists at least one file-level warning. |

### 2.6 Open Items (to revisit)

1. Shortcut keys (`X`, `Ctrl+O`) are initial defaults; revisit after user feedback before locking.
2. Whether `original_id` and `original_timestamp` should be surfaced in the QA metadata bar UI or remain backend-only.
3. Whether the import summary dialog should also offer a "undo import" action (batch-delete the just-imported items).
4. Long-term: define a `schema_version` migration registry so future format changes can be handled with explicit upgrade paths.