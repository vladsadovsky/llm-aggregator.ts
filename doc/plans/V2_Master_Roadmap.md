# LLM Aggregator — v2 Master Roadmap

**Status:** Proposal
**Drafted:** July 27, 2026
**Current version:** 1.3.2

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

### 0.1 Multi-provider LLM abstraction
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

**Sequencing note:** 0.1/0.2 gate all of Phase 2. 0.3/0.4/0.5 gate all of Phase 3. 0.6/0.7 gate
Phase 2 and Phase 4 shipping safely. Phase 1 has no Phase-0 dependency and can run in parallel with
Phase 0.

---

## Observations from the audit (design constraints for Phase 2+)

Tracing every consumer of the existing AI-metadata fields surfaced two patterns worth designing
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
- Retires `aiTopic`/`aiConcepts` as separate fields.
- Includes a one-time migration of existing `ai_topic`/`ai_concepts` frontmatter values into
  `tags[]`, plus a read-side legacy fallback for un-migrated files — same pattern already used for
  `## Question`/`## Answer` body markers.
- `aiSummary` (prose, not a label) is kept as-is, untouched by this merge.

### 2.3 QA workflow typing **[Idea]**
Explicit dead-end/branch/closure marking UI — the manual override that doesn't exist today
(Observation 2) — plus "learn from my marking" auto-detection that improves over time.

**Implementation notes:**
- Extends `aiStatus`/`metadataService.ts`, which stay separate enum fields rather than folding into
  tags (see Observation 4's rationale for keeping enums out of the tag array).
- The manual-override UI is the prerequisite: it's also the only source of training signal the
  "learn from my marking" loop would have to work with.

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
Phase 0 (foundation)  ──┬── unlocks ──> Phase 2 (LLM content intelligence)
                         └── unlocks ──> Phase 3 (power-user UX infra) ──> Phase 4 (MCP)
Phase 1 (near-term UX) ── runs in parallel with Phase 0, no dependency
```
