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
8. [Command Palette and Menus](#command-palette-and-menus)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Getting Started](#getting-started)
11. [Build, Test, and Script Reference](#build-test-and-script-reference)
12. [UI Testing Guide (Playwright)](#ui-testing-guide-playwright)
13. [Debugging in VS Code](#debugging-in-vs-code)
14. [Building Native Installers](#building-native-installers)
15. [Runtime Configuration](#runtime-configuration)
16. [Data Model and File Format](#data-model-and-file-format)
17. [Optional LLM Lens](#optional-llm-lens)
18. [Claude Desktop MCP Integration](#claude-desktop-mcp-integration)
19. [Project Structure](#project-structure)
20. [Technology Stack](#technology-stack)
21. [Generative AI Usage](#generative-ai-usage)
22. [Contributing](#contributing)
23. [Credits](#credits)
24. [License](#license)

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

#### Import from a shared conversation link
- Paste a public share link from **Claude**, **ChatGPT**, **Gemini**, or **Copilot** to import a
  whole conversation at once — it is split into Q&A pairs and grouped into a new thread.
- The thread and every imported QA are tagged with the provider and model name.
- If a conversation title is found it becomes the thread name; otherwise a name is derived from
  the first question and the app reminds you to rename it.

#### Import a whole account export (bulk)
- Point the same **Import from File** action at a vendor account export — the `.zip` as downloaded,
  the unzipped folder, or the conversations file inside it.
- Supported: **Claude**, **Gemini** (Google Takeout, HTML or JSON), and **ChatGPT** — all verified
  against real exports. ChatGPT exports are sharded (`conversations-000.json …`); every shard is read
  and merged automatically.
- A preview shows the conversation count, Q&A count, and date range, with a per-conversation
  checklist. Nothing is written until you confirm; progress reports percentage, ETA, and current item.
- Re-importing is safe: every imported QA records an `origin_id`, so pairs already in the archive
  are recognized and skipped rather than duplicated.

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
2. An Open dialog opens in the directory used for the previous import during this app session. Select a `.md` file.
3. After import:
   - A toast confirms how many QAs were created.
   - If warnings were detected (missing fields, version mismatch, no file header), an import summary dialog lists each issue per-item.
   - If the file contains a thread, the thread and its ordered QA membership are persisted together, then the imported thread is selected.

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

Thread files include `thread_name` and `thread_tags` header fields and separate QA blocks with
unambiguous HTML-comment boundaries. Import restores both ordered QA membership and thread tags,
so a round-tripped thread remains visible under the same thread-tag filters.

### Human-authored import files

Files without a YAML header are accepted. The parser uses the same flexible rules as the structured-paste feature:

- `## Question` / `## Answer` Markdown headings.
- Or `q: ...` / `a: ...` inline labels.
- Per-QA metadata lines (`title:`, `source:`, `tags:`, etc.) before the first `## Question` are optional.

Missing fields are filled with safe defaults and listed in the import summary.

### Importing from a shared conversation link

Import an entire shared conversation from a public link. Choose **Import → Shared link** (command
palette or the Import menu) and paste a URL of one of these forms:

- `https://claude.ai/share/…`
- `https://chatgpt.com/share/…`
- `https://share.gemini.google/…` (current) or `https://gemini.google.com/share/…` (legacy)
- `https://copilot.microsoft.com/shares/…`

The conversation is fetched, split into ordered Q&A pairs, and grouped into a new thread. The
thread and each QA are tagged with the provider and model name (for example `gemini` +
`gemini-3.6-flash`). When a title is present it becomes the thread name; otherwise a name is
derived from the first question and a reminder to rename it is shown.

Claude snapshots carry no model identifier, so Claude imports are tagged `claude` only — set the
specific model by hand afterwards if you want it recorded.

How each provider is read:

| Provider | Source | Fidelity |
|----------|--------|----------|
| Claude   | `api/chat_snapshots/<id>` JSON | Full Markdown |
| ChatGPT  | `backend-api/share/<id>` JSON (conversation tree) | Full Markdown |
| Copilot  | `c/api/conversations/shares/<id>` JSON | Full Markdown |
| Gemini   | Rendered in a hidden Electron `BrowserWindow`; answer HTML is converted back to Markdown with Turndown | Markdown recovered from rendered HTML |

> **Testing note — Gemini requires the Electron runtime.** Claude, ChatGPT, and Copilot parsing
> is pure and covered by the Vitest unit suite (including real-response fixtures). Gemini has no
> server-provided JSON, so its importer loads the real share page in a hidden `BrowserWindow`
> and scrapes the DOM. That path **cannot be exercised by the Node unit tests** — verify it
> end-to-end by running `npm run dev` and importing a Gemini share link, and re-check after any
> change to the Gemini extractor or when Gemini alters its share-page markup.

### Importing a whole account export (bulk)

Vendors let you download your entire history. **File → Import from File** (`Ctrl/Cmd+O`) accepts
those exports alongside `.md` files — pick the `.zip` exactly as downloaded, the folder you
unzipped it to, or the conversations file inside it. There is one menu entry for both: the app
identifies the file by its **structure**, not its name or extension.

| Provider | What to select | Status |
|----------|----------------|--------|
| Claude | The export `.zip` (contains `conversations.json`) | Verified against a real export |
| Gemini | The Google Takeout `.zip` (`My Activity/Gemini Apps/MyActivity.html`) | Verified against a real export |
| Copilot | `copilot-activity-history.csv` from the Microsoft privacy dashboard | Verified against a real export |
| ChatGPT | The export `.zip` (sharded `conversations-000.json … 00N.json`) | Verified against a real export (675 conversations → 3453 pairs) |

A preview appears before anything is written: format, conversation count, Q&A count, date range,
and a checklist of conversations with per-conversation pair counts. Deselect what you don't want,
then import. The app shows indeterminate feedback while a large file is being analyzed and while a
commit is starting; progress then shows percentage, ETA, and the item being written.

Two provider-specific caveats:

- **ChatGPT** exports are **sharded**: instead of a single `conversations.json`, a real export
  contains `conversations-000.json … conversations-00N.json`. All shards are found and merged
  automatically — select the `.zip`, the unzipped folder, or any one shard file. (Note also that
  ChatGPT's export encodes the message tree differently from its share links — via `current_node`
  rather than populated `children` — which the importer accounts for.)
- **Claude** exports carry no model identifier, so pairs are tagged `claude` only.
- **Copilot** exports as a CSV rather than an archive, and it *is* threaded — the `Conversation`
  column gives real thread names, so those are reconstructed rather than grouped by date. Get it
  from the Microsoft privacy dashboard → Copilot → **Export all activity history**.
- **Gemini Takeout is an activity log, not conversations.** Google exports each prompt and
  response as a standalone record with nothing linking follow-ups together, so the importer groups
  records by **calendar day** rather than inventing threads. Canvas, upload, and feedback records
  are skipped and reported. If Takeout offered you HTML or JSON, choose **HTML** — the JSON variant
  is recognized but not yet parsed.

#### Deduplication

Every imported pair records an `origin_id` in its frontmatter
(`<provider>:<conversationId>:<messageId>`). Re-importing the same export skips what is already
there instead of duplicating it, and the preview tells you up front how many pairs it recognizes.
Imported threads also retain the provider conversation identity: re-import reuses and extends the
existing thread instead of creating another copy. A thread imported before this identity was added
is adopted when its QA membership exactly matches the conversation; existing extra copies are left
untouched rather than deleted implicitly.
Because the key is anchored on a pair's first message, it survives the conversation being continued
and re-exported later, and a shared link and an account export of the *same* conversation produce
the same key.

For duplicates that predate this — or arrived by copy/paste — use **Tools → Find Duplicate Q&As**,
which sweeps the whole archive and also matches on normalized content. It only ever proposes: you
choose which copy to keep in each group, and nothing is deleted until you confirm.

#### Fragility of shared-link import

**Every provider here is read through an undocumented, unversioned, private endpoint.** None of
these are public APIs: there is no contract, no deprecation notice, and no version negotiation.
Any provider can rename a field, restructure a payload, tighten bot detection, or retire an
endpoint without warning, and the corresponding importer will break the same day. Treat this
feature as best-effort convenience, not as a dependable pipeline.

What that means in practice:

- **Failures are expected over time, and they are not your data's fault.** A broken importer
  never touches the archive — the import either produces pairs or raises an error.
- **Breakage is usually loud.** A changed payload shape surfaces as "no conversation content
  could be extracted" or a parse error, not as silent data loss.
- **But it can be quiet.** If a provider *adds* a message kind (a new content-block type, a
  tool/reasoning turn), the parser drops what it does not recognize. Skim the imported thread
  after a large import and check the per-item notes in the import summary.
- **Bot detection is the most likely first failure.** The JSON endpoints are fetched through
  Chromium's network stack with a browser `User-Agent`. Claude's `chat_snapshots` endpoint, for
  example, returns `403` without one. Tighter checks (cookies, tokens, challenge pages) would
  require moving that provider to the hidden-`BrowserWindow` approach Gemini already uses.
- **Only public links work.** Private, expired, deleted, or login-gated conversations fail by
  design; the app cannot authenticate as you.
- **Claude links are point-in-time snapshots.** If the original conversation continued after it
  was shared, the snapshot holds the older state — the importer flags this when the payload says
  the snapshot is stale.

When an importer breaks, the fix is normally confined to one provider: the pure parser in
`electron/services/import/parsers/` and, at most, the endpoint URL in `sharedLinkImportService.ts`.
Detection, pairing, tagging, and thread building are shared and provider-agnostic. Capture the
failing payload into the Vitest fixtures in `tests/unit/sharedLinkImport.test.ts` before changing
parser logic.

**The durable alternative** is each provider's own account data export (Claude and ChatGPT both
offer one), which is a supported, stable format. That is bulk backfill rather than single-link
import, and is not wired into the app today.

---

## Command Palette and Menus

Every end-user action is reachable from two **complete** surfaces, so no feature is hidden behind
a single button:

- **Command Palette** (`Ctrl/Cmd+K`) — a searchable list of every command. Type to filter, `Enter`
  to run. Each entry shows its keyboard shortcut, if any.
- **Application menu bar** — the same commands, grouped into menus:
  - **File** — New Q&A, Import from File, Import from Shared Link, Export Selected, Settings.
  - **Q&A** — Edit / Duplicate / Delete Selected, Save Changes, Move Up / Down in Thread.
  - **Thread** — New Thread, Rename Selected Thread, Show All Q&As, Show Unthreaded Q&As.
  - **View** — Focus Search, Toggle Dark Mode, LLM Lens when enabled, panel visibility, content
    zoom, **Application Status**, and archive maintenance: tag dictionary, embeddings, confidence
    annotation, and health checks; plus standard reload / zoom / full-screen / dev-tools.
  - **Help** — Open Command Palette, Keyboard Shortcuts, Usage Information, About.

  Menu items show their keyboard shortcut as a hint in parentheses.

An in-app **Usage Information** guide (overview, layout, import options, optional Lens, and the
full shortcut list) is always available from **Help → Usage Information** in the menu bar.

## Settings and Status

**Settings** is a tabbed dialog with **General**, **AI**, and **Metadata & Tags** sections. Its
content scrolls within the dialog while Cancel and Save remain visible. Settings contains only
preferences and key entry; concise control hints appear next to the relevant preference.

Operational detail is available separately from **View → Application Status** or the Command
Palette. It reports archive location, tag configuration, configured provider/model, non-secret key
provenance, model-catalog source, secure-storage availability, and active warnings.

Archive maintenance commands are available from **View** and the Command Palette: manage the tag
dictionary, generate embeddings, run the confidence annotation pass, and run the archive health
check.

The most common actions are **additionally** surfaced as **toolbar buttons** (Import and New Thread
in the Threads panel; optional LLM Lens, Dark Mode, and Settings top-right; Export in the content panel) and,
where relevant, right-click context menus. Toolbars and context menus deliberately carry only
high-traffic actions — the Command Palette and menu bar are the complete reference.

> Keyboard shortcuts are handled by the app itself (not by the OS menu), so context-sensitive
> chords like `Ctrl/Cmd+E` / `Ctrl/Cmd+D` / `Ctrl/Cmd+Shift+E` only fire when a Q&A is selected and
> you are not typing in a field. The menu lists them as hints; clicking the menu item always runs
> the action regardless of focus.

---

## Keyboard Shortcuts

<!-- Generated from shared/accelerators.ts. Do not hand-edit: tests/unit/accelerators.test.ts
     compares this table against that module and prints the expected rows on failure. -->

| Shortcut | Action | Context |
|----------|--------|---------|
| Ctrl/Cmd+S | Save while editing | Edit mode |
| Escape | Close dialog / cancel current action | Global |
| Ctrl/Cmd+K | Open command palette | Global |
| Ctrl/Cmd+F or / | Focus search | Global |
| Ctrl/Cmd+N | Create new Q&A | Global |
| Ctrl/Cmd+, | Open settings | Global |
| F2 | Rename selected thread | Thread selected |
| Ctrl/Cmd+E | Edit selected Q&A | Q&A selected |
| Ctrl/Cmd+D | Duplicate selected Q&A into new form | Q&A selected |
| Delete or Backspace | Delete selected Q&A (with confirmation) | Q&A selected |
| Alt+Up | Move selected Q&A up in thread | Thread mode |
| Alt+Down | Move selected Q&A down in thread | Thread mode |
| Ctrl/Cmd+Shift+E | Export selected Q&A or thread to file | Q&A or thread selected |
| Ctrl/Cmd+O | Import from file | Global |
| Ctrl/Cmd+Shift+O | Import from shared link | Global |
| ? | Show keyboard shortcuts | Global |
| Ctrl/Cmd+Enter | Submit form | Q&A editor |
| Up or Down | Navigate lists | Thread or Q&A list |

`Ctrl/Cmd+Plus`, `Ctrl/Cmd+Minus`, and `Ctrl/Cmd+0` zoom the whole window — that is Electron's
built-in behaviour, not an app binding. The **Zoom Content In / Out / Reset** commands under
**View** scale only the Q&A pane and are reached from the menu or the Command Palette.

---

## Getting Started

### Prerequisites

- Node.js 22.12+ (Node.js 24 LTS recommended)
- npm 11+
- VS Code extension Vue - Official (vue.volar) for Vue breakpoint/debug support

Supported V2 release targets:

- Windows 11 on x64
- macOS 12 Monterey or newer on Apple Silicon (ARM64); Intel Mac artifacts are not shipped

The retained Linux packaging commands are best-effort development outputs and are outside this
P0-B support commitment.

The P0-B application runtime is Electron 43.2.0. At implementation time Electron 44 was still a
prerelease and would also raise the macOS floor.

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
| npm run check | Clean-install dependency baseline, typecheck, lint, unit tests, build, and production audit |
| npm run check:dependencies | Verify installed imported-content parsers match the lockfile and security floors |
| npm run typecheck | Type check only |
| npm run lint | ESLint with auto-fix |
| npm run test | Run Vitest once |
| npm run test:watch | Run Vitest watch mode |
| npm run test:e2e | Run Electron Playwright tests |
| npm run test:e2e:smoke | Run focused Electron launch, preload, QA round-trip, and navigation security checks |
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

## Bumping up version
Run:
npm version patch --no-git-tag-version
(or minor/major as needed)
This updates package.json and package-lock together.
Run:
npm run build
For Windows release validation:
npm run electron:build:msi

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
npm run electron:build:msi
npm run electron:build:mac
npm run electron:build:linux
```

Expected artifact families:

- Windows 11 x64: NSIS installer and portable executable; the MSI-only command builds a native,
  assisted, per-user MSI for managed Windows Installer deployments
- macOS 12+ Apple Silicon: ARM64 DMG and ZIP (no Intel artifacts)
- Linux: AppImage and DEB

Cross-platform packaging can require host-specific signing/toolchain setup.
The MSI is currently unsigned and per-user. Code signing and per-machine deployment are
intentionally deferred to a later release.

Run clean install/uninstall validation inside a disposable Windows VM with:

```powershell
.\scripts\validate-msi-lifecycle.ps1 -CurrentMsi '.\dist\LLM Aggregator-<version>-win.msi'
```

To exercise a major upgrade, also pass `-PreviousMsi` pointing to an older MSI. The script
uses silent Windows Installer operations and writes verbose logs beneath the VM's temporary
directory. Do not run it on a workstation where an installation must be preserved.

---

## Runtime Configuration

App settings are stored in Electron's per-user application-data directory in `settings.json`.
The `dataDirectory` setting points to the separate folder that contains the user's archive.

Example:

```json
{
  "dataDirectory": "/path/to/your/data",
  "allowDevEnvSecrets": false
}
```

### Debug logging

Verbose diagnostic traces (for example `[settingsService] loadSettings from ...`) are now
opt-in and are disabled for normal development runs.

- `npm run dev`: no debug trace output from the app debug logger.
- `npm run dev:debug`: enables debug traces by setting `VITE_DEBUG_LEVEL=debug`.

When `npm run dev` is launched from the VS Code integrated terminal, the script
auto-initializes `VITE_DEBUG_LEVEL=debug`.

In production builds, the default level is `ERROR` when no override is provided.

Supported levels are `TRACE=0`, `DEBUG=1`, `WARNING=2`, `ERROR=3`.

You can also set `VITE_DEBUG_LEVEL` (or `LLM_AGG_DEBUG_LEVEL` for Electron main-process
only runs) in your shell before starting the app.

### API key storage

API keys are **never stored in `settings.json`** and are never written in clear text.
They are encrypted with your operating system's secure storage — DPAPI on Windows,
Keychain on macOS, libsecret/kwallet on Linux — and written to `secrets.enc.json`
in the same application-data directory. Because the encryption key belongs to your
OS user account, the file cannot be read by another user or on another machine.

Keys are also **write-only from the app's point of view**: the Settings window can
store a key and show a masked preview of it (`sk-…a1b2`), but never displays or
receives the full value back. Leaving the key field blank keeps the stored key as-is.

Keys resolve independently for each provider in a fixed order. The first source with a value wins:

| Order | Source | Notes |
|---|---|---|
| 1 | `LLM_AGG_OPENAI_API_KEY` / `LLM_AGG_ANTHROPIC_API_KEY` environment variables | Used only when development override is enabled and the app is unpackaged. Read-only. |
| 2 | `secrets.enc.json` (OS-encrypted) | Where Settings writes. |

If the development override is disabled, missing, or the app is packaged, environment variables
are skipped and the encrypted local value is used. An environment value therefore never replaces
or copies over the encrypted value; it only takes priority while the development-only override is
active.

Settings shows a compact key-source status and warnings if OS-backed encryption is unavailable
(in which case keys cannot be saved). **View → Application Status** provides the full non-secret
storage/backend report.

#### Development environment overrides

In development builds only, Settings offers **Use development environment variables
for API keys**. When enabled, an available `LLM_AGG_OPENAI_API_KEY` or
`LLM_AGG_ANTHROPIC_API_KEY` takes precedence over that provider's encrypted stored key. The
variable names are fixed and not configurable; setting only one variable affects only that provider.

The override requires **both** the setting to be on and the build to be unpackaged.
Enabling it and then running a packaged build has no effect — `settings.json` travels
with your user profile, so the packaged check is what prevents it from silently
applying to a production install.

An env-supplied key is a read-only overlay: the Settings field is disabled while one
is active, and saving other settings never copies the env value into stored secrets.

#### Upgrading from a previous version

Earlier versions stored keys in clear text in `secrets.json`. That file is **no longer
read**. On first launch it is renamed to `secrets.json.orphaned.bak` and you will need
to re-enter your API key in Settings. The renamed file still contains your old key in
clear text — delete it once you have re-entered the key.

### Default data directory on Windows

When no saved `dataDirectory` setting exists, LLM Aggregator chooses the default location
using this rule, in order:

1. If Windows advertises a OneDrive location and that OneDrive root directory exists, use:

   ```text
   <OneDrive root>\Documents\LLM-Aggregator
   ```

   A typical personal OneDrive location is:

   ```text
   C:\Users\<username>\OneDrive\Documents\LLM-Aggregator
   ```

   Work or school OneDrive roots are also supported. The application checks the Windows
   `OneDrive`, `OneDriveConsumer`, and `OneDriveCommercial` environment locations, in that
   order. In this context, "active OneDrive" means that Windows advertises one of those
   locations and its root folder currently exists. The application does not require the
   OneDrive process to be running at the exact moment it starts.

2. If no advertised OneDrive root exists, use the local Documents folder:

   ```text
   %USERPROFILE%\Documents\LLM-Aggregator
   ```

   For example:

   ```text
   C:\Users\<username>\Documents\LLM-Aggregator
   ```

This automatic selection applies only when there is no saved setting. Upgrading or
reinstalling the application does not move an existing archive and does not replace a
previously selected directory.

#### OneDrive versus local Documents

Choose the OneDrive location when you want the archive included in OneDrive sync and backup
and you understand that the archive files will be stored in your Microsoft cloud account.
This can make recovery and use across machines easier, subject to OneDrive's synchronization
and account configuration.

Choose a local or other custom location when the archive should remain outside OneDrive, when
its contents are sensitive, or when you want to avoid cloud availability and synchronization
conflicts. A local location is not automatically backed up by LLM Aggregator.

To inspect or change the active location, open **Settings**, find **Data Directory**, and use
the folder picker. Changing this setting points the application at the selected directory; it
does not copy or migrate files from the old directory. Move the existing `archive/`,
`threads.json`, and `tag-dictionary.json` yourself if you intend to relocate an existing
archive.

Runtime directory layout:

```text
<dataDirectory>/
  threads.json
  tag-dictionary.json
  archive/
    *.md
```

Other archive-related files may be added alongside these as features are enabled. Secrets and
the application setting that selects `dataDirectory` remain in Electron's per-user
application-data directory rather than in the archive folder.

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

Each QA is a Markdown file with YAML frontmatter. The **question is stored as a frontmatter field**; the **answer is the unrestricted Markdown body** below — no structural headers required.

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
question: What is the meaning of life?
ai_topic: epistemology
ai_confidence: working
---

42, and here is why — use any Markdown you like: `code`, **bold**,
## headings, tables, whatever.
```

Why this format works well:

- Human-readable and diff-friendly
- Easy to back up and sync
- No schema lock to proprietary systems

> **Note:** The `question` field is parsed as YAML. A bare `---` line inside a question would be misread as the frontmatter closing delimiter. The app automatically replaces bare `---` with `<hr>` on write. Hand-edited files should use `<hr>` for horizontal rules in questions.

---

## Optional LLM Lens

LLM Lens is an optional bottom panel for exploring the Q&A archive with AI. It is disabled by
default, so the focused capture, thread, search, and export workflow remains uncluttered.

### Enable and configure

1. Open **Settings** → **AI**.
2. Turn on **Enable LLM Lens** and save. The panel, toolbar button, command-palette command, and
  **View → Toggle LLM Lens** menu item appear immediately.
3. Select **OpenAI**, enter and test an OpenAI API key, then save. The key is encrypted with OS
  secure storage; the field subsequently displays only a masked preview. See
  [API key storage](#api-key-storage).
4. Choose **View → Generate All Embeddings** to index the archive. Embeddings are cached locally in
  `<userData>/embeddings.json` and are regenerated only when a Q&A pair changes.

Lens currently requires OpenAI as the active provider: it creates an embedding for each Lens
query and Anthropic does not supply embeddings through this application. Metadata generation can
still use Anthropic independently.

To hide Lens again, turn off **Enable LLM Lens** in **Settings** → **AI** and save. The panel and
all its entry points disappear immediately; no archive data, embeddings, or prompt history is
deleted.

### Use Lens

Open it with the sparkles toolbar button, **View → Toggle LLM Lens**, or the command palette.
Choose a mode, enter a topic or claim, then click **Run** or press `Ctrl/Cmd+Enter` while the Lens
input is focused. Each request searches the whole Q&A archive and sends the most relevant entries'
full questions and answers to the configured provider. Lens does not browse the web, retain a
chat conversation, or limit itself to the selected thread.

| Mode | Use it to |
|------|-----------|
| **Brief** | Review established conclusions, unresolved questions, and contradictions before resuming a topic. |
| **Prior Art** | See what the archive already covers and what remains open. |
| **Steelman** | Find archive evidence supporting and challenging a stated hypothesis. |
| **Gaps** | Generate 5-8 research questions grounded in unresolved archive material. |
| **Concept** | Summarize a concept's working model, limitations, open questions, and abandoned directions. |

Lens retrieves up to 12 related Q&As per request, or up to 20 for **Concept**. It keeps up to 20
prompt-history entries per mode in local browser storage. Results can be copied or saved as a new
Q&A with source `lens`. The token counter is session-only and can be reset from the panel.

The model catalog is cached in Electron user data (`model-catalog-cache.json`) so model selection
can still work when provider discovery is temporarily unavailable.

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
| HTML → Markdown (shared-link import) | Turndown + turndown-plugin-gfm |
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

- Developer, concepts and feature defintions beyond basic, maintainer: sadovskyvlad@gmail.com
- Original idea and first demonstration of AI feature set: eveselov@hotmail.com

---

## License

MIT. See LICENSE.md.
