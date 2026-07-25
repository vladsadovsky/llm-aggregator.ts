# Export & Interchange — Master Requirements and Design Specification

**Status:** File transport shipped (schema v1). All other targets unimplemented.
**Last updated:** 2026-07-25
**Applies to:** LLM Aggregator 1.1.2

## About this document

This is the single source of truth for getting archive content *out of* the app and
back *into* it. It merges and supersedes three earlier documents:

| Source document | Disposition |
|---|---|
| `Export to file_Spec.md` | Merged. Chapter 1 (human-authored requirements) is preserved **verbatim** in §2.1. Its Chapter 2 design is folded into §3–§5 and reconciled against shipped code. |
| `OneNote_Export_Agent_Spec.md` | Merged and **split along its seam**: transport/format detail → §6.3; the autonomous agent → Chapter 7, generalised to be target-agnostic. |
| `Export_Targets_Feasibility_Research_2026-07-24.md` | Merged into Chapter 6. Findings retained; framing corrected (see §6.1). |

The three source documents are retained for provenance. **Where they disagree with
this document, this document wins.**

> **Maintenance contract.** This describes what the code *does* plus what is
> *specified but unbuilt* — the two are labelled distinctly throughout. Any change to
> `qaExportFormatService`, `qaImportFormatService`, `fileExportService`,
> `fileImportService`, the `export:*` / `import:*` IPC channels, or the interchange
> format must update this file in the same commit. If code and document disagree,
> the code is right and this document is a bug.

**Status labels used throughout:**

| Label | Meaning |
|---|---|
| ✅ **Shipped** | Implemented and verified in the codebase at the stated version |
| 📋 **Specified** | Designed here, not yet implemented |
| 🔬 **Researched** | Feasibility assessed; no design committed |
| 💡 **Prospective** | Named as a future direction; not yet researched |

---

## Chapter 1: Purpose and scope

### 1.1 What this covers

Moving Q&A content across the boundary of the application, in both directions:

- **Export** — serialising a QA pair or thread and delivering it to a destination.
- **Import** — parsing content from a source back into archive records.

Export and import are specified together deliberately. Round-trip fidelity is a
primary requirement (§2.2), and the parser is what makes the serializer's contract
meaningful — a format defined without its reader is unverifiable.

### 1.2 What this does not cover

- The archive's own on-disk storage format (see `CLAUDE.md` § Data Model). The
  interchange format is deliberately independent of it — see §4.1.
- LLM provider integration (`LLM_Integration_Spec.md`).
- Secret storage mechanics (`Secrets_Storage_Design_and_Implementation.md`), though
  Chapter 8 states a hard dependency on it.

---

## Chapter 2: Requirements

### 2.1 Original human-authored requirements

> *Preserved verbatim from `Export to file_Spec.md` Chapter 1. Not to be edited by
> an AI agent. Reconciliation notes follow in §2.2.*

There is a batch ingest feature currently, which operates on the text, pasted into question field, representing series of QA pairs, separated from each other by syntactic delimeters.

I want to add persistence to the applicaiton by implementing import and export commands, operating on a thread or an individial QA pair.

Export semantic is to use currently selected item, present a "Save As" type dialog, resulting in chosen by user fully qualified file name. Application then is supposed to save text content to the file, compatible with the format of the batch ingest feature with addition of necessary tags and thread name and other top level metadata, if thread is being exported.

Each QA pair, exported, as a single, or as part of the thread, must contain all of the stored metadata.

Import semantic is reversed, file is selected, which contains single QA or a thread of QAs. Content of the file may be previously saved by this application, although it may be different version of it OR it may be hand created by the human or an external app or agent, familiar with expected format. SPecific format of the imported items may be flexible within common choices - different delimeters or placement of tags, for example, so that regular human would understand the structure of what's being imported.

At the header level file must be tagged with application writer metadata (in the case of the current application being a writer, that includes at least version). If no header is present, it is assumed that file is authored by the human.

Requirements:
- round trip must work with full fidelity
- UI test scripts must be added and included as a part of comprehensive UI test
- versions of saving application don't have to match, code must deal with the mismatch intelligently (whatever that may mean)
- Further details of the design, implementation, testing must go into this file, but follow up section. AI agent is not expected to change human authored section
- architectural requirement for the code organization is to prepare for the future features exporting to non file (like OneNote), where similar format may be used to export content into a note.

### 2.2 Requirement compliance

| # | Requirement (from §2.1) | Status | Note |
|---|---|---|---|
| R1 | Export operates on selected QA or thread | ✅ Shipped | `export:qa`, `export:thread` |
| R2 | "Save As" dialog, user-chosen path | ✅ Shipped | `fileExportService` |
| R3 | Compatible with batch-ingest format | ✅ Shipped | `## Question` / `## Answer` retained |
| R4 | Thread name + top-level metadata on thread export | ✅ Shipped | File header, `thread_name` |
| R5 | **Each QA contains all stored metadata** | ❌ **Not met** | Six `ai_*` fields dropped — see §4.4 |
| R6 | Import accepts app-written and human-written files | ✅ Shipped | Header-absent path |
| R7 | Format flexibility for human authors | ✅ Shipped | §5.2 tolerance list |
| R8 | Writer metadata in file header incl. version | ✅ Shipped | `writer_app`, `writer_version`, `schema_version` |
| R9 | **Round trip with full fidelity** | ⚠️ **Partial** | Blocked by R5 |
| R10 | UI test scripts in comprehensive UI test | ✅ Shipped | `tests/e2e/export-import.spec.ts` |
| R11 | Intelligent handling of version mismatch | ✅ Shipped | Best-effort + warnings, §5.3 |
| R12 | **Code organised for non-file targets** | ✅ Shipped | Format/transport seam, §3.1 — this is what makes Chapter 6 tractable |

**R5 and R9 are the outstanding defects.** §4.4 specifies the fix (schema v2).

### 2.3 Non-functional requirements

| # | Requirement | Rationale |
|---|---|---|
| N1 | Export is deterministic — same input yields byte-identical output apart from `exported_at` | Makes diffing and testing possible |
| N2 | Format services are pure — no filesystem, no network, no Electron imports | Enables reuse by every transport and unit testing without a runtime |
| N3 | Import never overwrites — always creates new records | Stated conflict policy; prevents destructive import |
| N4 | Import never hard-fails on a malformed item; anomalies are reported, not thrown | A partly-bad file should still yield its good items |
| N5 | Interchange format is human-readable and hand-authorable | Explicit user requirement (§2.1) |
| N6 | Credentials for remote targets are never written in clear text and never reach the renderer | Chapter 8 |

---

## Chapter 3: Architecture

### 3.1 The format/transport seam ✅ Shipped

Requirement R12 is satisfied by separating *what content looks like* from *where it
goes*. This seam already exists and is the foundation every target in Chapter 6
builds on.

```
   ┌──────────────────── FORMAT (pure) ────────────────────┐
   │  qaExportFormatService.ts   QAPairData → string       │
   │  qaImportFormatService.ts   string → ImportResult     │
   │  No fs. No network. No electron imports.              │
   └────────────────────────┬──────────────────────────────┘
                            │ reused unchanged by every transport
        ┌───────────────────┼────────────────────┬──────────────────┐
        │                   │                    │                  │
┌───────┴──────┐   ┌────────┴────────┐  ┌────────┴───────┐ ┌────────┴───────┐
│ file  ✅     │   │ OneNote 📋      │  │ Notion 📋      │ │ Obsidian 💡    │
│ Save/Open    │   │ Graph API       │  │ REST API       │ │ vault folder   │
│ dialog + fs  │   │ + HTML renderer │  │ + block mapper │ │ + fs           │
└──────────────┘   └─────────────────┘  └────────────────┘ └────────────────┘
```

**Adding a target means writing a transport, not touching the format.** Targets that
need a different *representation* (OneNote wants HTML, Notion wants block JSON) add a
**renderer** alongside the transport; the canonical Markdown remains the single
upstream source those renderers consume.

### 3.2 Module inventory

| Module | Status | Responsibility |
|---|---|---|
| `electron/services/qaExportFormatService.ts` | ✅ | Serialise QA/thread → Markdown. Owns `SCHEMA_VERSION`, `WRITER_APP`, filename suggestions |
| `electron/services/qaImportFormatService.ts` | ✅ | Parse Markdown → `ImportResult`. Owns tolerance rules |
| `electron/services/fileExportService.ts` | ✅ | Save dialog + write |
| `electron/services/fileImportService.ts` | ✅ | Open dialog + read |
| `electron/services/import/sharedLinkImportService.ts` | ✅ | Import a shared LLM conversation URL — a *second import transport* (§5.5) |
| `electron/services/exportTargetRegistry.ts` | 📋 | Target descriptors: id, label, capabilities, auth requirement (§6.2) |
| `electron/services/render/oneNoteHtmlRenderer.ts` | 📋 | Canonical → OneNote HTML |
| `electron/services/exportHistoryService.ts` | 📋 | Export records; prerequisite for Chapter 7 |

### 3.3 IPC surface

| Channel | Status | In | Out |
|---|---|---|---|
| `export:qa` | ✅ | `id: string` | `ExportResult \| null` |
| `export:thread` | ✅ | `threadId: string` | `ExportResult \| null` |
| `import:file` | ✅ | — | `ImportResult \| null` |
| `import:sharedLink` | ✅ | `url: string` | `SharedImportResult` |
| `export:targets` | 📋 | — | `ExportTargetDescriptor[]` |
| `export:toTarget` | 📋 | `{ targetId, selection, options }` | `ExportResult` |

`null` means the user cancelled; it is not an error and produces no toast.

**Design note for `export:toTarget`.** New targets must not each add their own channel
pair — that is how the model-catalog work ended up with a hardcoded provider chain
(see `Secrets_Storage_Design_and_Implementation.md` §2.1 for the analogous mistake).
One channel plus a registry keeps the IPC surface flat as targets are added.

---

## Chapter 4: Canonical interchange format

### 4.1 Status as a frozen contract

**The interchange format is a stable, versioned contract, deliberately independent of
how the archive stores data internally.**

This matters because the two have already diverged. The archive now stores the
question in YAML frontmatter with the answer as the document body (`CLAUDE.md` § Data
Model), while the interchange format retains `## Question` / `## Answer` headings.
That divergence is **intentional, not drift**:

- The interchange format is what humans hand-author and what external agents target.
  Two visible headings are easier to write correctly than frontmatter-with-block-scalars.
- It preserves batch-ingest compatibility (R3).
- Archive storage may evolve for indexing or performance reasons that interchange
  consumers should not have to track.

Changes to the interchange format are governed by `schema_version` (§4.5), not by
archive changes.

### 4.2 File header ✅ Shipped

Every app-produced file opens with YAML frontmatter. Absence signals a human-authored
file and triggers the tolerant path (§5.2).

```yaml
---
writer_app: llm-aggregator
writer_version: 1.1.1
schema_version: 1
exported_at: 2026-03-15T12:00:00.000Z
export_type: qa          # or: thread
thread_name: My Thread   # thread exports only
---
```

### 4.3 Per-QA block ✅ Shipped (schema v1)

Metadata as `key: value` lines immediately preceding `## Question`. Thread exports
separate blocks with `---` on its own line.

```markdown
title: My Question Title
source: claude
url: https://claude.ai/chat/abc123
tags: typescript, electron
version: 3
original_id: 20260204_2135
original_timestamp: 2026-02-04T21:35:57.826479

## Question

Question content here.

## Answer

Answer content here.
```

`original_id` / `original_timestamp` are auxiliary provenance only. Import always
regenerates identity (§5.4).

### 4.4 Schema v2 — AI metadata 📋 Specified

**Defect being fixed.** R5 requires all stored metadata to be exported. The v1
serializer omits all six machine-generated fields, so an export/import round trip
silently discards them — including `ai_status` and `ai_confidence`, which are partly
*user-curated* through the annotation dialog rather than purely derived.

Schema v2 appends to the per-QA block, after `original_timestamp`:

```yaml
ai_topic: gradient descent
ai_concepts: backprop, loss, optimization
ai_status: open              # open | closed | speculative | dead-end
ai_confidence: working       # speculative | working | confident | validated
ai_summary: Brief summary of the conclusion.
ai_related_ids: 20260204_2135, 20260205_1845
```

**Rules:**

1. Fields are **omitted entirely when unset** — never emitted empty. Keeps exports of
   un-analysed archives identical in shape to v1.
2. List fields (`ai_concepts`, `ai_related_ids`) use the same comma-separated
   convention as `tags`.
3. `ai_related_ids` holds *original* IDs, which will not resolve after import
   regenerates identity. Import must therefore **preserve the values but not treat
   them as live references**, and attach a per-item warning when any are present.
4. **Values must be single-line.** The block-metadata parser is line-oriented
   (`^([\w_]+)\s*:\s*(.*)$`), so an embedded newline silently truncates the value and
   orphans the remainder. `ai_summary` is the realistic offender: collapse newlines to
   spaces on write. A multi-line-capable field would require block scalars and a
   parser change — out of scope for v2.
5. Bump `SCHEMA_VERSION` to `2`.

**Compatibility both ways:**

| Case | Behaviour |
|---|---|
| v2 reader, v1 file | Fields absent → left unset. Version warning already emitted by the tolerant parser. |
| v1 reader, v2 file | Unknown `key: value` lines before `## Question` are ignored by the existing block parser. Degrades cleanly — no crash, no corruption. |

Because v1 readers degrade cleanly, v2 is a **minor, non-breaking** format change.

### 4.5 Version governance

| Field | Meaning | On mismatch |
|---|---|---|
| `writer_app` | Producing application | Warn, proceed |
| `writer_version` | App version — informational | Never blocks |
| `schema_version` | **Format contract version** | Warn, best-effort parse |

`schema_version` increments only when block or header *structure* changes. Adding
optional fields is a minor increment; removing or repurposing a field requires an
explicit migration entry, and there is currently no migration registry — see §11.

---

## Chapter 5: Import

### 5.1 Contract ✅ Shipped

```typescript
interface ImportedQA {
  data: QACreateData
  warnings: string[]        // per-item anomalies
  originalId: string
  originalTimestamp: string
}

interface ImportResult {
  exportType: 'qa' | 'thread' | 'unknown'
  threadName?: string
  items: ImportedQA[]
  fileWarnings: string[]    // file-level anomalies
}
```

### 5.2 Tolerance rules ✅ Shipped

Satisfying R7, the parser accepts:

| Variation | Handling |
|---|---|
| No file header | Human-authored path; file-level warning |
| `schema_version` / `writer_app` mismatch | Best-effort; file-level warning |
| `## question` / `# Question` casing and depth variants | Accepted |
| Inline `q:` / `a:` delimiters | Accepted (batch-ingest compatibility) |
| Missing per-QA fields | Safe defaults (empty string / empty array) |
| No `---` separator | Treated as a single block |
| Zero parseable blocks | Empty `items`, file-level warning — never throws |

### 5.3 Version mismatch (R11)

"Intelligently" is resolved as: **never block, always report.** Import proceeds; each
anomaly is recorded at file or item level and surfaced in the post-import summary.
The rationale is that a user importing a file from an older build wants their content,
not a refusal.

### 5.4 Identity and conflict policy ✅ Shipped

- IDs and timestamps are **always regenerated**. Import creates new records, every time.
- `original_id` / `original_timestamp` are carried through as auxiliary provenance.
- **No overwrite path exists.** Importing the same file twice yields two independent
  copies. This is deliberate (N3) — deduplication would require a merge UI and a
  content-identity rule the archive does not currently define.

### 5.5 Shared-link import ✅ Shipped

A second import transport, absent from all three source documents. It fetches a shared
conversation URL (ChatGPT / Gemini / Copilot), splits it into QA pairs, and creates a
thread — the same destination as file import, reached through a different transport,
which validates the seam in the inbound direction.

It does **not** use `qaImportFormatService`: it parses provider HTML rather than the
canonical format. Both converge on `QACreateData`.

📋 **Specified:** shared-link import should surface its per-item anomalies through the
same summary dialog as file import. Two import paths with two different reporting
styles is a UX inconsistency worth closing.

---

## Chapter 6: Export targets

### 6.1 How to read this chapter

This supersedes `Export_Targets_Feasibility_Research_2026-07-24.md`. The findings
are retained; four framing problems are corrected:

1. **Verdicts are per-mode, never averaged.** The source rated Gemini Notebook "medium
   feasibility overall" while its own matrix said Low-direct / High-indirect. There is
   no medium case; averaging hid the actual answer. Each target below is rated
   separately for direct API and indirect paths.
2. **Feasibility is assessed against this product.** The source rated Apple Notes
   "low to medium" without noting that this app is Windows-first (MSI packaging,
   `%APPDATA%` defaults, win32 archive defaults). Platform reality is now explicit.
3. **Auth burden is a first-class column.** The source rated OneNote and Notion "high
   feasibility" without accounting for OAuth registration, consent, and token storage
   — the last of which is *blocked on unfinished work* (Chapter 8).
4. **Effort is expressed against the existing seam** (§3.1), not greenfield. The
   indirect Gemini Notebook path in particular is mostly the *existing file exporter*
   plus a new destination.

### 6.2 Target matrix

Effort assumes the format layer is reused unchanged.

| Target | Direct API | Indirect | Auth burden | Blocked on | Status |
|---|---|---|---|---|---|
| **File** | n/a | n/a | None | — | ✅ Shipped |
| **Obsidian** | n/a — plain files | High | None | — | 💡 Prospective |
| **OneNote** | High | Medium | OAuth2 PKCE + Azure app registration | Secrets V2 | 📋 Specified |
| **Notion** | High | High | OAuth2 + integration setup | Secrets V2 | 🔬 Researched |
| **Gemini Notebook** | **None** — no public write API | High — via Drive/Docs/file ingestion | Google OAuth (indirect path only) | Secrets V2 | 🔬 Researched |
| **Apple Notes** | None — no public cloud REST API | Low on macOS; **not applicable on Windows** | n/a | Platform | 🔬 Researched |

### 6.3 File ✅ Shipped

Reference implementation of the seam. Save/Open dialogs, `.md` output, suggested
filenames (`{title-slug}_{date}.md`, `thread_{name-slug}_{date}.md`). Entry points:
toolbar, context menu, command palette, `X` (export selection), `Ctrl+O` (import).

### 6.4 Obsidian 💡 Prospective

**Not covered by the 2026-07-24 research** — added to scope afterwards; the assessment
below is reasoning from the vault model, not verified against documentation.

An Obsidian vault is a folder of Markdown files. Export is therefore the **file
transport with a different default directory** plus optional Obsidian conventions
(`[[wikilinks]]` between related QAs, tag lines as `#tags`, YAML frontmatter Obsidian
already understands).

This is plausibly the **cheapest remaining target and the only one needing no
credentials at all**, which is why it is called out despite being unresearched.
Verify before committing: whether writing into a vault while Obsidian is running
causes index issues, and whether `[[wikilink]]` generation is wanted or intrusive.

### 6.5 OneNote 📋 Specified

Highest-detail unbuilt target; design inherited from `OneNote_Export_Agent_Spec.md`.

**Auth.** OAuth2 PKCE against Azure AD — public client, no client secret. Scopes
`Notes.ReadWrite`, `Notes.Create`. Requires a free Azure app registration; the client
ID is user-supplied in Settings. Flow runs in a main-process `BrowserWindow`.

**Graph endpoints:** `/me/onenote/notebooks`, `/me/onenote/notebooks/{id}/sections`,
`POST /me/onenote/sections/{id}/pages`, `PATCH /me/onenote/pages/{id}/content`.

**Rendering.** OneNote accepts a restricted HTML dialect. Constraints that shape the
renderer: no `<style>` blocks (inline styles only), no `<script>`, no flexbox or grid,
images must be base64 or separate calls, and **code blocks render without syntax
highlighting**. That last one matters for a QA archive full of code — the renderer
should preserve `<pre><code>` structure and accept the loss of colour rather than
attempt inline-styled token spans.

**Update semantics.** `oneNotePageId` is retained per export so a re-export of the same
thread can `PATCH` rather than duplicate. This makes OneNote the first target with a
meaningful *update* path, and is a prerequisite for the agent's "8 new QAs since last
export" behaviour (Chapter 7).

### 6.6 Notion 🔬 Researched

Well-documented page-creation and block APIs; the natural second remote target. The
work is a **block mapper** — Notion consumes structured block JSON rather than
Markdown, so this is the target that proves the renderer abstraction generalises
beyond OneNote's HTML.

### 6.7 Gemini Notebook 🔬 Researched

**There is no public write API.** A discovery-index query (Appendix B) returns only
Google Cloud Notebooks — unrelated infrastructure, not the Gemini Notebook product.
Direct export is not merely hard; it is unavailable.

The viable path is **source handoff**: Gemini Notebook ingests Google Docs, Drive
files, URLs, and uploaded Markdown / TXT / PDF / DOCX / PPTX / CSV / ePub.

Verified constraints: **500,000 words or 200 MB per source**; **50 sources** on the
free tier; Drive-backed sources sync after a delay; URL ingestion is text-scrape only;
paywalled content unsupported; some Google-file elements (comments, footnotes) do not
import.

**This is the cheapest remote target relative to the existing seam** — "write Markdown,
put it where Gemini Notebook can ingest it" is the shipped file exporter plus a
destination. The source research rated it "medium overall" and buried this.

### 6.8 Apple Notes 🔬 Researched — not applicable on the primary platform

No public third-party cloud REST API. Available routes are local macOS automation
(Shortcuts, AppleScript, UI scripting) requiring granted app permissions, and are
fragile by nature.

**For this product it is effectively out of scope, not "low feasibility."** The app
ships as a Windows MSI with Windows-specific defaults; a macOS-only local-automation
integration would serve no current user. Revisit only if macOS becomes a supported
target.

### 6.9 Validity and re-verification

Chapter 6 rests on external product surfaces that change. Findings carry an expiry.

| Content | Verified | Re-verify when | Trigger |
|---|---|---|---|
| Gemini Notebook ingestion limits, absence of write API | 2026-07-24 | **Before any implementation**, or if >90 days old | Active NotebookLM→Gemini Notebook transition |
| OneNote Graph endpoints, HTML constraints | 2026-07-24 | Before implementation | Stable API; low drift risk |
| Notion page/block API | 2026-07-24 | Before implementation | Stable API; low drift risk |
| Apple Notes automation surface | 2026-07-24 | Only if macOS becomes supported | — |
| Obsidian vault behaviour | **Never verified** | Before implementation | §6.4 is reasoning, not research |

---

## Chapter 7: Export automation (agent layer) 📋 Specified

### 7.1 Separation from targets

The source document fused an autonomous agent with the OneNote integration. They are
**independent axes**:

- Every target is usable **manually**, with no agent.
- The agent is an **optional layer** that decides *what* and *when* to export, then
  delegates to any target's transport.

Nothing in the scoring logic below is OneNote-specific. Binding them would force the
scoring engine to be built before OneNote could ship, and would need undoing the
moment a second automated target appeared.

### 7.2 Capability

Analyse the archive, learn from export history, and propose (or with approval, perform)
exports: mature threads, threads idle long enough to be considered settled, threads
whose tags match previously exported topics, and previously-exported threads that have
accumulated new QAs.

### 7.3 Persistence

```typescript
interface ExportRecord {
  id: string
  timestamp: string
  threadId: string
  threadName: string        // as at export time
  qaCount: number
  tags: string[]            // as at export time
  targetId: string          // 'file' | 'onenote' | 'notion' | …
  targetLocator: string     // path, or notebook/section, or page id
  remoteId?: string         // enables update-in-place where supported (§6.5)
  status: 'success' | 'failed' | 'partial'
  errorMessage?: string
}

interface ExportPreference {
  tagToDestinationMapping: Record<string, string>
  minQAsBeforeExport: number
  minIdleDaysBeforeExport: number
  autoSuggest: boolean
  defaultTargetId: string
  defaultDestination: string
}
```

Stored as `export-history.json` in the data directory. **Generalised from the source
document**, which hardcoded `oneNoteNotebook` / `oneNoteSection` / `oneNotePageId`;
those become `targetId` + `targetLocator` + `remoteId`.

### 7.4 Scoring

Additive heuristic producing a 0–1 confidence with a human-readable reason:

| Δ | Factor |
|---|---|
| +0.3 | Thread has ≥ `minQAsBeforeExport` pairs |
| +0.2 | Idle ≥ `minIdleDaysBeforeExport` days |
| +0.2 | Tags match previously exported tags |
| +0.1 | Complete metadata across all QAs |
| +0.1 | Similar thread exported before |
| +0.1 | Matches the user's established export cadence |
| −0.3 | Previously suggested and declined |
| −0.5 | Recently modified — still active |

The negative weights carry the actual intelligence: declining a suggestion must be a
durable signal, or the agent nags.

### 7.5 Optional LLM enhancement

Where an LLM provider is configured, the agent may propose destination names from
content, generate per-thread summaries, identify merge candidates, and write an index
page. **Strictly additive** — every agent function must work without an LLM configured.

### 7.6 Approval

Autonomous export performs **externally visible, hard-to-reverse** actions in a
third-party account. Approval before export is therefore the default, and the
preference to disable it should be presented as a deliberate opt-out rather than a
convenience toggle.

---

## Chapter 8: Security and prerequisites

### 8.1 Hard dependency: multi-provider secret storage

**Every authenticated target in Chapter 6 is blocked on secrets V2.**

The shipped secrets chain (`Secrets_Storage_Design_and_Implementation.md`) encrypts at
rest via Electron `safeStorage` and keeps values out of the renderer — exactly the
properties OAuth tokens need, and the source OneNote document already anticipated
`safeStorage`. But `AppSecrets` is a **fixed two-field interface**
(`openaiApiKey`, `anthropicApiKey`). There is nowhere to put a OneNote refresh token.

Required first: **V2 Step 5 — multi-provider namespace** (arbitrary provider keys in
map form). Until then, no authenticated target can be implemented without either
standing up a second parallel secret store — rejected, as two secret systems double
the audit surface — or regressing to clear-text storage.

### 8.2 Token handling rules

| # | Rule |
|---|---|
| S1 | Tokens live in the `safeStorage`-backed chain. **Never** in `settings.json`, never in `export-history.json` |
| S2 | Tokens never cross to the renderer. Settings shows connection state and account identity only — the same write-only model as API keys |
| S3 | Minimum scopes. OneNote: `Notes.ReadWrite` + `Notes.Create`, nothing broader |
| S4 | PKCE public-client flow; no client secret is stored |
| S5 | Refresh is automatic and main-process-only |
| S6 | Disconnect must revoke and delete stored tokens, not merely forget them locally |
| S7 | Export history is local and never transmitted |
| S8 | Archive content goes only to the user's chosen target. LLM enhancement (§7.5) sends thread *metadata*, and full content only with explicit consent |

### 8.3 Content-boundary caution

Export moves potentially sensitive archive content into third-party accounts. The
destination picker must make the target account unambiguous — a mis-targeted export to
the wrong tenant is not undoable from inside this app.

---

## Chapter 9: Testing

### 9.1 Shipped

`tests/e2e/export-import.spec.ts` — Playwright happy paths: single-QA export, single-QA
import, thread export, thread import, `original_id` preservation, and the
missing-header warning path.

### 9.2 Specified 📋

| Layer | Coverage |
|---|---|
| **Unit — format** | Serializer determinism (N1); v2 field emission and omission-when-unset; v1↔v2 compatibility both directions (§4.4) |
| **Unit — parser** | Every tolerance rule in §5.2 as a discrete case; zero-block file; malformed block among good blocks (N4) |
| **Round trip** | Property-style: archive record → export → import → compare **all** fields, including `ai_*`. This is the test that would have caught R5 |
| **Renderer** | OneNote HTML contains no `<style>`/`<script>`; code blocks survive as `<pre><code>` |
| **Transport** | Cancel returns `null` and produces no toast; write failure surfaces an error |
| **Agent** | Scoring determinism; declined suggestions stay suppressed (§7.4) |

The format services are pure (N2), so everything above the transport row needs no
Electron runtime — the same property that makes the secrets resolver unit-testable.

---

## Chapter 10: Roadmap and recommendation

### 10.1 Recommended order

The source feasibility study reached no recommendation. This one does.

| Phase | Work | Why here |
|---|---|---|
| **1** | **Schema v2 — AI metadata** (§4.4) + round-trip test | Closes a stated requirement (R5/R9) already contradicted by the code. Small, self-contained, no dependencies. Every later target inherits the fix for free. |
| **2** | **Obsidian / vault-folder export** (§6.4) | Cheapest possible second target: file transport, new default directory, no credentials. Forces the target *registry* into existence against a trivial case, before OAuth complexity arrives. Verify §6.9 first. |
| **3** | **Secrets V2 multi-provider namespace** | The hard gate (§8.1). Nothing authenticated ships before it. |
| **4** | **OneNote** (§6.5) | Highest practical value; most design detail already exists; introduces OAuth, the HTML renderer, and update-in-place. |
| **5** | **Gemini Notebook via file/Drive handoff** (§6.7) | Re-verify first (§6.9). Largely the phase-1/2 exporter aimed at an ingestion point. |
| **6** | **Notion** (§6.6) | Proves the renderer abstraction against a non-HTML representation. |
| **7** | **Agent layer** (Chapter 7) | Needs ≥2 targets and accumulated history to be worth anything. Building it earlier means inventing the history it learns from. |
| **—** | **Apple Notes** | Not scheduled. Revisit only if macOS becomes supported (§6.8). |

### 10.2 Rationale for the ordering

Phase 1 before any new target: shipping more targets on a format known to lose data
multiplies the defect. Phase 2 before phase 4: introduce the registry abstraction on a
target with no auth, so registry bugs and OAuth bugs are never being debugged at once.
Phase 3 as a gate rather than a parallel track: a second secret store to unblock
phase 4 is the kind of shortcut that never gets unwound. Phase 7 last because an agent
that learns from history needs history.

---

## Chapter 11: Open items

| # | Item | Source |
|---|---|---|
| 1 | No `schema_version` **migration registry**. Additive changes are handled; a breaking change has no defined upgrade path | `Export to file_Spec.md` §2.6.4 |
| 2 | Should `original_id` / `original_timestamp` be surfaced in the metadata bar, or stay backend-only? | `Export to file_Spec.md` §2.6.2 |
| 3 | Should the import summary offer **undo** (batch-delete just-imported items)? Weight rose with §5.4 — no dedup means repeat import silently duplicates | `Export to file_Spec.md` §2.6.3 |
| 4 | Shortcuts `X` / `Ctrl+O` were provisional pending feedback; still unconfirmed | `Export to file_Spec.md` §2.6.1 |
| 5 | `ai_related_ids` cannot survive identity regeneration (§4.4 rule 3). A stable cross-reference would need content-identity the archive does not define | This document |
| 6 | Shared-link import reports anomalies differently from file import (§5.5) | This document |
| 7 | No **export** counterpart to shared-link import — no "copy to clipboard as Markdown". Cheap given the seam; unrequested | This document |
| 8 | Obsidian assessment is unverified reasoning (§6.4, §6.9) | This document |

---

## Appendix A: Source document disposition

| Source | Sections absorbed | Sections deliberately dropped |
|---|---|---|
| `Export to file_Spec.md` | Ch.1 verbatim → §2.1; format → Ch.4; architecture → Ch.3; import → Ch.5; tests → §9.1; open items → Ch.11 | Phase-by-phase implementation checklist — the work is shipped; the checklist is now history, tracked in `build-notes.md` |
| `OneNote_Export_Agent_Spec.md` | Auth/Graph/HTML → §6.5; history schema → §7.3 (generalised); scoring → §7.4; LLM enhancement → §7.5; security → §8.2 | ASCII dashboard mock-ups (UI design, not requirements); the "Comparison with Other Agentic Ideas" star table (an idea-selection artefact, not a spec); day-level effort estimates (unreliable and already stale) |
| `Export_Targets_Feasibility_Research_2026-07-24.md` | Per-target findings → §6.5–§6.8; limits → §6.7; sources → Appendix C; discovery method → Appendix B | The averaged "medium feasibility overall" verdict (§6.1 point 1); the flat heading structure |

## Appendix B: Gemini Notebook API discovery — verification method

The source document titled this section "Verification Snippet" but contained prose
rather than a runnable command. The actual check, reproducible:

```bash
# Query Google's public API discovery directory for any Notebook-related API
curl -s https://www.googleapis.com/discovery/v1/apis \
  | jq -r '.items[] | select(
      (.name + " " + .title + " " + (.description // ""))
      | ascii_downcase
      | test("notebook|gemini|notebooklm")
    ) | "\(.name):\(.version)  \(.title)"'
```

Result at 2026-07-24:

```
notebooks:v1  Notebooks API        ← Google Cloud infrastructure notebooks
notebooks:v2  Notebooks API        ← Google Cloud infrastructure notebooks
```

**Interpretation:** no Gemini Notebook / NotebookLM entry exists in the public
discovery index. Both hits are Google Cloud's managed-notebook-instance service,
unrelated to the Gemini Notebook product. Absence from the discovery index is strong
but not absolute evidence — an API could exist outside it — so this supports "no public
write API found", not "no API exists".

## Appendix C: Sources consulted

**Gemini Notebook / Google**
- https://support.google.com/gemininotebook/answer/16215270
- https://support.google.com/gemininotebook/answer/16164461
- https://support.google.com/gemininotebook/answer/17003757
- https://www.googleapis.com/discovery/v1/apis
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://ai.google.dev/

**Notion**
- https://developers.notion.com/reference/intro
- https://developers.notion.com/reference/post-page

**OneNote**
- https://learn.microsoft.com/en-us/graph/integrate-with-onenote
- https://learn.microsoft.com/en-us/graph/api/section-post-pages

**Apple Notes / automation**
- https://support.apple.com/guide/notes/import-and-export-notes-apd4b2161e74/mac
- https://support.apple.com/guide/shortcuts-mac/welcome/mac
- https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AutomatetheUserInterface.html

**Obsidian** — none. §6.4 is unverified reasoning; see §6.9.
