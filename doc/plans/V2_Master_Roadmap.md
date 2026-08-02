# LLM Aggregator — v2 Master Roadmap

**Status:** Proposal
**Drafted:** July 27, 2026
**Updated:** August 2, 2026
**Current version:** 1.4.1

## Sources

This plan consolidates three inputs, filtered to what is still open:

1. **`doc/plans/LLM_Integration_Spec.md`** — Chapters 1–4 (auto-titles, auto-tags, semantic search, fundamentals).
2. **`doc/plans/UX_ImprovementPlan.md`** — Phase 1 and Phase 2 only. Phase 3 (mobile/touch) and Phase 4
   (accessibility, markdown preview, JSON/CSV export) are explicitly **out of scope for v2** — see below.
3. **`doc/plans/Ideas.md`** — all sections.

Each item below is tagged with its origin: **[LLM]**, **[UX]**, or **[Idea]**.

---

## Current-state snapshot (why this plan looks the way it does)

A codebase audit (July 27, 2026) found more LLM infrastructure already built than either planning
doc assumes. This reshapes the plan significantly — several "propose and build" items are actually
"extend what exists," and one major foundation gap (single-provider lock-in) blocks almost
everything else:

| Area | State | Evidence |
|---|---|---|
| LLM provider layer | **Partial.** Only `openai` and `anthropic` in `providerRegistry.ts`. `anthropicProvider.embed()` throws — Anthropic can't embed. No Ollama, no Azure OpenAI, no local model. | `electron/services/llm/` |
| Semantic search | **Done.** Real embeddings + cosine similarity (`embeddingService.ts`), wired to `searchQuery(..., 'semantic')`. Requires OpenAI (only embed-capable provider) and a manual "generate all embeddings" step. | LLM Ch.3 — already shipped, not a v2 item |
| LLM auto-title (QA/thread) | **Not implemented.** `QAEditor.vue`'s `autoTitle` is string truncation, no LLM call. | LLM Ch.1 |
| LLM auto-tags | **Not implemented as its own feature — but overlaps with `aiTopic`/`aiConcepts` below.** Tag autocomplete is dictionary-based only, no suggestion model. Phase 2 merges this with metadata typing rather than building a second, parallel LLM-labeling pipeline (see Observations). | LLM Ch.2 |
| QA metadata typing (topic/concepts/status/confidence) | **Done**, via `metadataService.ts` (`ai:generateMetadata`), but `aiTopic`/`aiConcepts` duplicate what tags are for — freeform LLM-generated labels that never touch the tag vocabulary. `aiStatus`/`aiConfidence` (enums) are the genuinely distinct part — most of LLM Ch.4's "smart typization." | `metadataService.ts` |
| Confidence annotation review | **Done.** `AnnotationDialog.vue` + `annotationService.ts` batch-review `aiConfidence` with user approval — this is the reusable pattern for future batch-LLM UX. | — |
| Thread compression (remove dead ends) | **Not implemented.** | LLM Ch.4 |
| MCP / skills interface | **Not implemented** in-app. | LLM Ch.4, [Idea] |
| Multi-select / bulk ops | **Not implemented.** No checkbox/Ctrl+Click/Shift+Click anywhere. | UX 5.1 |
| Undo/redo | **Not implemented.** No command-pattern or history stack in any store. | UX 6.1/6.2 |
| Export whole thread to file | **Done.** `formatThreadExport` + "Export" action in `ThreadsPanel.vue`. | [Idea] — already shipped, not a v2 item |
| Drag-and-drop reordering | Not implemented — but this is UX Phase 3, out of scope. | — |
| Threads-list filtering/search | **Well behind the QA list.** `ThreadsPanel.vue` has tag-chip filtering only (`threadStore.activeTagFilters`); sort is hardcoded alphabetical (`sortedThreadIds`). No name filter, no date filter, no content search. `QAListPanel.vue` already has debounced real-time search (full-text/tags/semantic), configurable sort, and scope toggle. The threads list is typically the *longer* list (bulk imports produce hundreds of threads), so this asymmetry is backwards. | New Phase 1 item — see 1.1 |

**Implication for sequencing:** auto-title, auto-tags, thread compression, and MCP tools all need to
call an LLM for structured, cheap, repeatable work. Building each against the two-provider,
completion-only surface that exists today means redoing the same provider work four times, and
locks users who only have an Anthropic key out of every new feature (no embed, and no cheap local
option). **Phase 0 exists to fix that once.**

---

## Phase 0 — Foundation & technical debt

**Goal:** Build the shared infrastructure that every later phase depends on, so v2 features are
additions to a platform rather than four one-off integrations.

### 0.0 Release stabilization carry-over — **sequenced first**

Deferred from 1.4 on 2026-07-28. Full rationale, per-item risk assessment, and the analytical record
of where we diverged from the review's proposed remedies are in
`doc/dev_process/Release_1.4_Implementation_Plan.md`; the findings themselves are in
`doc/dev_process/Release_Architecture_and_Stability_Review_2026-07-27.md`.

1.4 shipped only additive guards, single-expression fixes, and hygiene — navigation lockdown,
HTTPS-only Gemini share links, the dependency bump, filename sanitization, bulk-import recoverability,
the `npm run check` gate, and the outstanding GitHub issues (#8, #13, #14, #15). **Phase 0 therefore
starts with an empty issue tracker.** Everything below needs automated and manual soak time, which is
why it is here rather than in a patch release.

**This subsection gates all of Phase 0 and everything after it.** Building the batch runner (0.2), the
selection model (0.3), or the undo layer (0.4) on non-atomic writes and an unvalidated IPC boundary
means building them twice.

| Item | Review finding |
|---|---|
| Electron `^33 → ^43`; `electron-builder ^25 → ^26`. **Do this first, alone, on its own branch.** Known breaks: `main.ts:275` `console-message` signature (changed in E37) and the builder major. Gate on Windows OS support before merge. | SEC-02 |
| Sender guard plus zod payload validation at the IPC boundary; canonical `shared/contracts/`. Also reconciles the drifted `includeDateInThreadNames` and `originId` declarations. | IPC-01, ARCH-01 |
| Gemini hidden-window containment: non-persistent session partition, `https:` only, deny popups and permissions, allowlisted redirects, redacted share tokens. | SEC-03 |
| `fetchJson` transport policy: manual redirect with a 3-hop cap, 20s timeout, response byte ceiling, structured error codes. | SEC-03 |
| Atomic writes at all nine write sites; refuse-to-save after a failed load; `threadService.loadThreads` try/catch; report skipped and duplicate-ID pairs as archive health data. | DATA-01 |
| One `ArchivePaths` authority; embedding namespacing by archive, record versioning with provider/model/dimensions, dimension guard before cosine similarity, GC for deleted pairs. | DATA-02 |
| Bulk import: incremental `saveThreads`, hoisted ID allocation, `getPair` id→path map, async yielding commit, real cancellation. Removes the main-process freeze that currently invites a force-quit. | IMP-01 |
| Aggregate import budgets; `crypto.randomUUID()` preview IDs; TTL and `webContents` ownership; `previewThreadId` row identity; numeric shard ordering. | IMP-02 |
| `safeStorage.getSelectedStorageBackend()` (treat Linux `basic_text` as insecure); atomic envelope write; legacy-plaintext migrate/purge. Closes `CLAUDE.md` roadmap item #1. | SEC-04 |
| Settings as one draft: reordered save, explicit `testConnection` config, stale-catalog guard, `validateDataDirectory`, `useSettingsDraft` composable. Needs a jsdom Vitest project. | SET-01 |
| LLM capabilities as data; `@anthropic-ai/sdk` swap. Closes `CLAUDE.md` roadmap item #2 and reduces **0.1** to adapter work. | LLM-01 |
| `useCommandRegistry`, `useImportCoordinator`; replace the 15 untyped `llm:*` window events with typed store actions. | ARCH-02 |
| Documentation reconciliation across README, in-app help, `main.ts:73`, and `noEmbeddingsMessage()`. | DOC-01 |

**Timebox the Electron upgrade.** Electron ships roughly every eight weeks, so the jump grows with
delay (33→44, 33→45). It needs a committed date, not an open end. EOL also means an unpatched Node in
main, which matters when `yauzl` inflates a zip a user downloaded.

### 0.1 Multi-provider LLM abstraction

> **Partly delivered by 0.0.** The stabilization carry-over adds the `complete`/`embed` capability
> matrix, splits `LLMProvider` into `CompletionProvider` / `EmbeddingProvider`, and replaces the
> hand-rolled Anthropic client with `@anthropic-ai/sdk`. What remains here is the Ollama and Azure
> OpenAI adapters against a contract that already exists, plus the `streaming` / `local` flags.

Extend `providerRegistry.ts` / `providerFactory.ts` with a capability matrix (`complete`, `embed`,
`streaming`, `local`) and add:
- **Ollama** adapter (local, free, no key) — unblocks users without paid API keys and de-risks the
  "local LLM ships with the product" fundamental **[LLM Ch.4]** without committing to bundling a model yet.
- **Azure OpenAI** adapter **[LLM Ch.4]** — mostly config-shape work on top of the existing OpenAI provider.

Without this, Phase 2's LLM features are Anthropic-or-nothing for `complete` and OpenAI-only for `embed`.

### 0.2 Generic batch-LLM job runner
Extract the batching/progress/cancel/approve pattern already proven in `annotationService.ts` +
`AnnotationDialog.vue` into a shared `llm/batchRunner.ts` + a generic review-dialog shell. Reuse it
for auto-title, auto-tag, and thread-compression suggestions (Phase 2) instead of writing the same
"batch N items → call LLM → let user approve" plumbing three more times.

### 0.3 Selection model (multi-select)
A shared composable/store for multi-select state (Ctrl+Click, Shift+Click range, checkbox mode),
usable by both `QAListPanel.vue` and `ThreadsPanel.vue`. This is the prerequisite for bulk
operations, multi-target context menus, and favorites-by-selection — building it once avoids three
divergent selection implementations in Phase 3.

### 0.4 Command/undo infrastructure
A lightweight command-pattern layer (`invoke()`/`undo()`/`redo()`) wrapping the mutating actions in
`qaStore.ts` / `threadStore.ts` (delete, move, edit, tag change). Needed for UX 6.1/6.2, but also
gives every future destructive action (including bulk ops in Phase 3) undo for free instead of a
bespoke confirmation dialog each time.

### 0.5 Query/filter engine
A shared predicate builder (source, date range, tag set, URL presence, full-text) for QA pairs, used
by advanced search filters **[UX 4.1]** and virtual/smart threads **[Idea]**. (Thread-list filtering
itself doesn't need this — see **1.1**, which found the threads-list gaps to be direct-field
lookups, not predicate-engine territory.) Building the predicate logic once means "virtual threads"
is just "a saved filter" on top of the same engine, not a parallel feature.

### 0.6 Feature-flag / experimental-features surface
An "Experimental Features" section in `SettingsDialog.vue` **[Idea: "optional features dialog for
experimentation"]**. Phase 2's LLM-cost-incurring features (auto-tag, compression, MCP) and Phase 4
(MCP server) ship behind flags here, so users opt in rather than incurring unexpected API cost or
instability by default.

### 0.7 LLM usage guardrails
A thin per-session call counter + rough cost estimate, surfaced as a toast/status item. Phase 0.1–0.2
multiply the number of call sites significantly (title, tags, compression, MCP tool calls); this
should exist before, not after, that fan-out.

**Sequencing note:** 0.0 gates everything — it is the stabilization floor the rest of Phase 0 is built
on, and the Electron upgrade inside it should land first and alone. After that: 0.1/0.2 gate all of
Phase 2. 0.3/0.4/0.5 gate all of Phase 3. 0.6/0.7 gate Phase 2 and Phase 4 shipping safely. Phase 1
has no Phase-0 dependency and can run in parallel with Phase 0. The optional audit follow-up below
does not gate Phase 1 or Phase 2.

---

## Observations from the audit (backlog input, not a release gate)

Tracing every consumer of the existing AI-metadata fields surfaced four patterns worth designing
around, not just noting:

**1. Every existing LLM feature is manual and low-visibility, and that's why it went unnoticed.**
"AI Metadata" is a button on the QA panel that does nothing until clicked; "Run Confidence
Annotation Pass" only exists as a command-palette/menu entry with no panel affordance at all; the
"Semantic" search mode is a dropdown option that silently requires a prior "Generate All
Embeddings" run. None of the three auto-runs, badges, or otherwise prompts a user toward them — you
find them by reading the code or the command palette, not by using the app. Auto-title and auto-tag
generation (Phase 2) are the same *shape* of feature (an opt-in LLM call on a QA), so building them
the same way — a button that does nothing until pressed — repeats the discoverability gap a third
time. Phase 2 items should default to *suggesting* inline (e.g., a dismissible inline suggestion
chip next to an empty title/tags field) rather than requiring the user to already know a hidden
action exists.

**2. `aiStatus` (open/closed/speculative/dead-end) has no manual override today — the "learn from
marking" idea has no marking to learn from yet.** The LLM sets `aiStatus` once, via "AI Metadata";
nothing in `QAEditForm.vue` lets a user correct it. So Ideas.md's "marking QA workflow type + learn
from my marking" isn't an extension of an existing correction flow — the correction flow doesn't
exist. Phase 2's workflow-typing item needs to build the manual override UI *first*, both because
users will want to fix wrong LLM guesses regardless of the learning loop, and because those
corrections are the only training signal "learn from my marking" would have to work with.

**3. `aiConfidence` has exactly one downstream consumer (`healthService.ts`'s "missing confidence"
gap list) and is neither filterable nor sortable.** Before Phase 2 adds *more* AI-generated fields
(titles, tags), it's worth deciding whether `aiStatus`/`aiConfidence` should become first-class
filter/sort dimensions (feeding the Phase 0.5 query engine) — otherwise each new AI field risks the
same fate: generated, displayed as a chip, and otherwise inert.

**4. `aiTopic`/`aiConcepts` and the planned "LLM auto-tag suggestion" [LLM Ch.2] are the same feature
built twice — decision: merge the generation, keep the enums separate.** Both are LLM-extracted,
open-vocabulary, "what is this about" labels; the only difference is that `aiConcepts` bypasses the
tag vocabulary and approval flow entirely. `aiStatus`/`aiConfidence` are a different kind of thing —
single-valued enums describing workflow/epistemic state, not open-vocabulary labels — and stay
separate fields with their own dedicated chips rather than folding into `tags[]`. Concretely, for
Phase 2 (see below):
- One LLM call replaces both "AI Metadata" and "auto-tag suggestion." It proposes candidate tags
  through the *existing* vocabulary-aware, soft/hard-limit approval flow (blue=existing/yellow=new
  chips) **[LLM Ch.2]**, writing straight into `tags[]`.
- `aiTopic` and `aiConcepts` are retired as separate frontmatter fields. Existing archived `.md`
  files carry `ai_topic`/`ai_concepts` today (per `CLAUDE.md`'s documented frontmatter schema), so
  this needs a one-time migration folding their values into `tags[]` on next write/open, plus a
  read-side fallback for files not yet migrated — the same "legacy fallback" pattern already used
  for `## Question`/`## Answer` body markers.
- `aiStatus`/`aiConfidence` are untouched by this merge; they're addressed by Observation 2's
  manual-override UI instead.

---

## Optional follow-up — AI metadata convergence & activation (**deferred**)

**Decision update (August 1, 2026):** The full Phase 0.8 proposal is correct in direction but too large
and architectural for the application's current needs. It is deferred and optional. It does not gate
Phase 1, Phase 2, or release. Future work will select small, tactical improvements from this section
and give each one a separately approved scope before implementation.

The original comprehensive analysis is retained in
`doc/dev_process/V2_Phase_0_8_Implementation_Plan.md` as a design reference, not an authorized
implementation program.

### 0.8.1 Human-owned workflow metadata

- Add manual `aiStatus` and `aiConfidence` controls to the QA edit flow, including an explicit
  unset value. Keep the existing bounded enums; do not invent a `branch` state here without first
  deciding whether branching is a status or a relationship between QAs/threads.
- Record whether each value is `manual` or `generated`. Missing provenance on an existing value is
  treated as `legacy`, never guessed to be manual.
- A generated proposal never overwrites a manual value without a specific user approval. Manual
  labels are the future learning signal for Phase 2.3; Phase 0.8 does not train or tune a model.
- Surface `aiSummary` directly instead of leaving it accessible only through an `aiTopic` tooltip.

### 0.8.2 Canonical tags and legacy-label migration

- Retire `aiTopic`/`aiConcepts` from new writes and generation contracts. `tags[]` is the sole
  persisted open-vocabulary classification field; `aiStatus`/`aiConfidence` remain separate enums,
  and `aiSummary` remains prose.
- Preserve old archives with a pure read-side fallback. Opening or listing an archive must not write
  files. On the next successful edit—or through an explicit previewable archive migration—normalize,
  de-duplicate, and fold `ai_topic`/`ai_concepts` into `tags[]`, then omit the deprecated fields.
- Make migration lossless, idempotent, atomic per QA, cancellable between QAs, and compatible with
  tag-vocabulary review. Never silently truncate labels or auto-rewrite an entire archive on load.
- Replace the health report's `missingTopic` concept with canonical tag coverage and counts of
  records still awaiting legacy-label migration.

### 0.8.3 First-class metadata facets

- Extend the Phase 0.5 query AST and compiler with status and confidence sets plus explicit
  include-missing semantics. Define stable enum ordering and deterministic tie-breaking before UI
  code depends on it.
- Expose status/confidence filters and sorts in the QA list. Keep filter state independent from the
  threads list so Phase 1.1's shared filter-bar extraction cannot couple the two panels.
- Make metadata coverage and filter behavior operate on the same canonical projection used by the
  renderer, health report, and future Phase 2 consumers.

### 0.8.4 Discoverable, no-surprise AI assistance

- Add compact contextual affordances where the user encounters the need: set/suggest missing
  workflow metadata beside the QA metadata, show semantic-index coverage and a generate/continue
  action beside Semantic search, and expose confidence-review/migration actions in Application
  Status. Menu and command-palette entries remain secondary access paths.
- Replace the current generate-and-immediately-save metadata action with a read-only suggestion
  envelope carrying target version/content hash. The user reviews and applies selected fields; stale
  suggestions are rejected.
- Showing readiness or missing-data hints is local and free. Provider calls still require an explicit
  action, main-process feature enforcement, a usage estimate/guard, and an embed/complete-capable
  provider. Merely selecting a QA or Semantic mode makes zero network calls.
- Centralize readiness counts (embedding coverage, missing status/confidence, pending legacy labels,
  provider capability) so the QA panel, search UI, health report, and Application Status do not
  calculate contradictory states.

**Possible future outcome:** Individually approved tactical slices may improve discoverability,
manual correction, metadata usefulness, or legacy-field cleanup without adopting the full program.

---

## Phase 1 — Near-term UX refinement

**Goal:** Ship the remaining low-risk, high-value UX gaps with no new architecture. Can run in
parallel with Phase 0.

### 1.1 Unified list filter/search UI — Threads + QA **[UX]**
Bring the threads list up to the same real-time filter/search/sort standard the QA list already
has. Supersedes the original "real-time name filter in the threads list" ask, and absorbs the
"date-range filter in the thread list" item originally slotted into Phase 3 — both turn out to be
free, direct-field filters once analyzed structurally (see Implementation notes), not blocked on the
Phase 0.5 query engine the way the QA-side advanced filters are. This is the higher-priority half of
the asymmetry, not a cosmetic parity item: the threads list is typically the *longer* list of the
two (bulk imports commonly produce hundreds of threads), so it's the one that most needs filtering.

**Implementation notes:**
- Thread filters split into two costs: **free** (direct `ThreadData` fields — name substring, `tags`
  (already built), `createdAt`/`updatedAt` range, `items.length` size — all O(1) per thread, no
  rollup) and **derived** (require inspecting member QA pairs — content/full-text match, source).
  The free set alone covers name filter, date-range filter, and size sort with no backend work.
- Content search over threads is already half-built: `ThreadsPanel.vue`'s `threadMatchCount()`
  today only decorates the panel as a side effect of an archive-scoped QA search initiated from the
  *other* panel. Promote it to a first-class thread search mode — call `qaStore.searchPairs()`
  directly from `ThreadsPanel`, then filter/sort `filteredSortedThreadIds` by intersecting
  `thread.items` with the result set. No new search index needed.
- Extract a shared `ListFilterBar` component/composable out of `QAListPanel.vue`'s existing
  search-bar block (debounced text input, mode selector, sort selector, chip row) and mount it in
  both panels, parameterized per list (QA modes: full-text/tags/semantic; thread modes:
  name/content/tags).
- Do **not** back both panels with the same `uiStore` search-state singleton
  (`searchQuery`/`searchType`/`sortBy`/`searchScope`) — today that's one global slot because only
  the QA panel uses it. Give threads independent state (extend `threadStore`'s existing
  `activeTagFilters` with `nameFilter`, `dateRange`, `sortBy: 'name' | 'recent' | 'size'`) so typing
  in one panel's filter never affects the other.
- New thread sort options, mirroring the QA list's date/title toggle: by name (current default), by
  recency (`updatedAt`), by size (`items.length`).

### 1.2 Search result highlighting **[UX 4.3]**
Highlight matched terms in QA title/snippet so users can see why an item matched.

### 1.3 Context menus **[UX 11.7]**
Right-click menu on list items: Edit/Delete/Move/Copy/Duplicate.

### 1.4 Recent/Favorites for QAs **[UX 11.2]**
Starred/favorited QAs and a "recently accessed" list for quick access.

### 1.5 Collapsible tag-selector box above the threads list **[UX]**
Avoid vertical space blowout when a thread's tag list is long — collapse/expand affordance.

### 1.6 Title uniqueness check / warning **[UX 3.2]**
Flag duplicate titles at creation time rather than allowing silent collisions.

### 1.7 "Clear remembered metadata" action in Settings **[UX 2.1 residual]**
One-click reset for the last-used source/tags/URL pre-fill values.

### 1.8 Native OS tray icon **[Idea: "Native OS invocation"]**
Standalone — no dependency on the rest of the plan.

---

## Phase 2 — LLM content intelligence

**Goal:** The features `LLM_Integration_Spec.md` was written for. Depends on Phase 0.1 (provider
abstraction) and 0.2 (batch runner) — do not start before those land, or this becomes three
redundant provider integrations.

### 2.1 LLM auto-title generation **[LLM Ch.1]**
Auto-generate titles for QAs and threads, including the UX plan's framing of smarter titles for
imported/constructed threads (e.g. Gemini Takeout day-buckets) **[UX]**.

### 2.2 Unified AI-tagging **[LLM Ch.2]**
Replaces both "AI Metadata" and the separately-proposed "LLM auto-tag suggestion" — see
Observation 4. One LLM call, existing-vocabulary-aware with soft/hard limits, surfaced via the
approve-new-tags chip flow, writing into `tags[]` for both QAs and threads **[UX]**.

**Implementation notes:**
- Retires `aiTopic`/`aiConcepts` as separate fields only if a separately approved, narrowly scoped
  compatibility/migration change is included. Do not implicitly adopt the deferred full program.
- Proposes existing-vocabulary and new-tag candidates through the established review flow. Only
  approved tags are written.
- `aiSummary` (prose, not a label) is kept as-is, untouched by this merge.

### 2.3 QA workflow typing **[Idea]**
Explicit dead-end/branch/closure marking and any later "learn from my marking" behavior. Scope the
manual correction flow as a small standalone improvement before considering learning or provenance
infrastructure.

**Implementation notes:**
- Extends `aiStatus`/`metadataService.ts`, which stay separate enum fields rather than folding into
  tags (see Observation 4's rationale for keeping enums out of the tag array).
- Do not add a `branch` enum until deciding whether branching is a status or a QA/thread relationship.
- Learning, provenance infrastructure, and generated/manual precedence automation remain optional
  follow-ups rather than prerequisites for a basic manual control.

### 2.4 Smart thread compression **[LLM Ch.4]**
Propose removing dead-end branches from a thread view. Built on the batch runner (0.2) and the
workflow typing above (2.3) — sequence after both.

### 2.5 Multi-provider surfacing in Settings
Expose Ollama/Azure OpenAI (built in 0.1) as selectable providers, including embed-capability
detection so semantic search degrades gracefully on embed-incapable providers.

### 2.6 Local/offline model — spike only **[LLM Ch.4]**
"Ships with the product optionally" is a large commitment (bundling, packaging size, license
review). Scope Phase 2 to a feasibility spike — viability of bundling a small local model vs. just
documenting Ollama setup — rather than full delivery.

---

## Phase 3 — Power-user UX infrastructure

**Goal:** The structurally harder UX-plan items, unlocked by Phase 0.3/0.4/0.5.

### 3.1 Bulk operations **[UX 5.1]**
Multi-select delete/move/tag/export, bulk-action toolbar.

### 3.2 Advanced search filters **[UX 4.1]**
Source, date range, URL-presence, multi-criteria (tags AND text) filtering — for QA pairs. (The
thread-list date-range filter originally proposed here turned out not to need the Phase 0.5 query
engine and moved to **1.1**.)

### 3.3 Undo/redo system **[UX 6.1, 6.2]**
`Ctrl+Z`/`Ctrl+Y` and "Undo" toast actions, plus edit history / version diffing in
`QAContentPanel.vue` — the `version` field already incremented on every update has never been
surfaced; this finally uses it.

### 3.4 Virtual threads based on saved-filter criteria **[Idea]**
Implemented as a named, saved query against the Phase 0.5 filter engine rather than a materialized
thread.

### 3.5 Application trash and recoverable deletion **[Idea]**
An archive-local trash system for destructive operations across both QA files and thread records.
The application, rather than the operating system's recycle bin, owns restore semantics because a
recoverable operation may span physical QA files, records embedded in `threads.json`, membership
ordering, and other archive metadata. Each deletion is captured as one operation with a stable ID,
timestamp, original paths/IDs, complete deleted thread records, original membership/order, archive
namespace and revision, and enough integrity metadata to validate a restore without overwriting
newer data.

Deletion uses same-volume moves where possible plus a durable manifest/journal and staged commit so
interruption cannot silently leave the archive half-deleted. Restore operates at item or operation
scope, validates collisions and current references, rebuilds the original topology, and fails closed
when the archive has changed incompatibly. A Trash UI supports inspection, selective restore,
restore-all, explicit emptying, and a configurable retention policy. All destructive entry points
(single and bulk QA/thread deletion, repair tools, and undoable commands) eventually route through
this service so they share one recovery contract.

The OS recycle bin may provide a secondary safety net when permanently purging physical files, but
it is not the authoritative trash: it cannot restore thread records, membership/order, or an entire
multi-record operation atomically. This capability complements the Phase 0.4 command/undo layer:
short-lived Undo can restore the most recent command quickly, while application trash provides
durable recovery across sessions and process restarts.

---

## Phase 4 — Ecosystem: MCP / skills interface

**Goal:** Expose the archive to external agents, gated behind the Phase 0.6 experimental-features flag.

### 4.1 Robust MCP server interface **[LLM Ch.4]**, **[Idea: "Robust MCP/skills interface"]**
Read/search/create tools over the archive (`qaListAll`, `searchQuery`, `qaCreate`-equivalent) so
external tools (Claude Code, Claude Desktop, other MCP clients) can query and extend the archive
directly, reusing the provider/guardrail work from Phase 0 for any agent-side LLM calls the server
itself needs to make.

This is sequenced last because it's additive surface area (new attack surface, new IPC-adjacent
trust boundary) best built once the rest of the data model (workflow typing, tags, titles) has
stabilized in Phase 2.

---

## Phase 5 — Distribution integrity & code signing

**Goal:** Make an artifact verifiable by someone who did not build it.

**Deferred from the 1.4 stabilization release by explicit decision (2026-07-28).** Covers REL-01 of
`doc/dev_process/Release_Architecture_and_Stability_Review_2026-07-27.md`, and everything downstream
of signing:

### 5.1 Platform signing
- Windows Authenticode signing of the NSIS and MSI installers and the executable. `electron-builder.yml`
  defines Windows installers today with no signing configuration at all.
- macOS signing plus notarization.

### 5.2 Artifact provenance
- Published SHA-256 checksums per artifact.
- A release manifest binding version, source commit, dependency-lockfile hash, build environment,
  targets, and signatures. Packaging gated on the manifest being produced.

### 5.3 Audience definition
Decide and document the intended release audience. Until 5.1 and 5.2 land, artifacts stay explicitly
labeled private, unsigned development builds — which the README already states correctly, and which
is an acceptable boundary for a local build whose operator understands the publisher warning.

**Note on what did *not* defer:** 1.4 ships the engineering half of the release gate — `npm run check`
(typecheck + lint + unit tests + build) with CI enforcement, and packaging scripts depending on it.
Only the artifact-integrity half is deferred here, because it is the half that depends on signing
existing.

**Sequencing:** independent of Phases 0–4. It gates *external distribution*, not development, so it
can land at any point before the first release intended for an audience beyond the author.

---

## Standing requirement across every phase

**[Idea: "Expose all new functions via keyboard and menu"]** is not a phase deliverable — it's
already the house rule in `CLAUDE.md` (`appCommands` registry feeds both the command palette and the
native menu). Every item above that adds a user-triggered action must register there; call this out
in review for each phase, don't schedule it separately.

---

## Explicitly out of scope for v2

Per the source docs, carried forward as future work, not part of this plan:

- **UX Phase 3** (mobile responsiveness, touch gestures) and **UX Phase 4** (accessibility/ARIA,
  markdown live-preview editor, JSON/CSV export) — deferred per `UX_ImprovementPlan.md`'s own phasing.
- Already-shipped items incorrectly still listed as "ideas" in source docs: semantic search
  (LLM Ch.3), whole-thread export (Ideas.md).

---

## Sequencing summary

```
Phase 0.0 (stabilization) ──> Phase 0.1-0.7 (foundation) ──┬── unlocks ──> Phase 2 (LLM intelligence)
                                                            └── unlocks ──> Phase 3 (power-user UX) ──> Phase 4 (MCP)
Phase 1 (near-term UX) ── runs in parallel with Phase 0, no dependency
Optional AI-metadata follow-up ── deferred; tactical slices only; no phase gate
Phase 5 (distribution) ── independent; gates external distribution, not development
```
