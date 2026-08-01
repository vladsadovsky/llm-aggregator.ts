# V2 Phase 0.8 — AI Metadata Convergence and Activation

**Status:** Proposed implementation and regression plan  
**Date:** August 1, 2026  
**Scope:** `V2_Master_Roadmap.md` Phase 0.8  
**Sequence:** Complete after the original Phase 0 gate and before Phase 1 or Phase 2

## 1. Goal and completion contract

Phase 0.8 converts the accepted findings in “Observations from the audit” into a safe product and
data-model foundation. Existing AI metadata must stop being a hidden, mostly inert side channel
before v2 adds auto-titles, AI tags, workflow learning, or thread compression.

Phase 0.8 is complete only when all of the following are true:

1. A user can set, change, and clear workflow status and confidence without making an LLM call.
2. Manual workflow metadata is distinguishable from generated metadata and cannot be overwritten by
   generation without explicit approval.
3. `tags[]` is the only open-vocabulary classification field written by new code. Existing
   `ai_topic`/`ai_concepts` data remains readable and has an atomic, lossless, idempotent migration.
4. Status and confidence are useful query/filter/sort dimensions with explicit missing-value
   behavior, not display-only chips.
5. AI readiness and relevant actions appear where users need them: QA metadata, Semantic search,
   and Application Status. Menu and command-palette entries remain available as secondary paths.
6. Metadata generation returns a reviewable, stale-checked proposal and performs no write until the
   user applies selected fields.
7. Selecting a QA, opening a filter, choosing Semantic mode, or displaying readiness makes zero
   provider/network calls.
8. Automated tests cover contracts, provenance, legacy reads, migration, filtering/sorting,
   discoverability, no-call behavior, staleness, cancellation, and injected write failures.

## 2. Sources and scope decisions

This plan implements all four decisions in `doc/plans/V2_Master_Roadmap.md` under “Observations from
the audit” and carries forward the Phase 0 safety properties summarized in that roadmap. It is
self-contained so it can be reviewed from `master` while the detailed Phase 0 implementation work
continues on `vlads-dev`.

### 2.1 In scope

- Manual QA workflow-status and confidence editing.
- Human/generated/legacy provenance for status and confidence.
- Direct display of the existing AI summary.
- Deprecation and migration of `aiTopic`/`aiConcepts` and their snake-case frontmatter keys.
- Status/confidence query facets and deterministic sort keys.
- A central, read-only AI-readiness projection.
- Contextual local affordances for missing metadata, confidence review, semantic-index readiness,
  and legacy migration.
- Conversion of immediate-write metadata generation to review-then-apply behavior.
- Health-report, Application Status, README, in-app help, and roadmap reconciliation.

### 2.2 Explicitly out of scope

- Auto-title and unified AI-tag generation; these remain Phase 2.1 and 2.2.
- A learning algorithm, fine-tuning, embeddings of user corrections, or remote training-data upload;
  Phase 0.8 only creates trustworthy local labels for Phase 2.3 to consume.
- Smart thread compression, local-model bundling, MCP, bulk operations, or virtual threads.
- Background/eager LLM calls, automatic embedding generation, or calls triggered by selection/open.
- A new `branch` workflow status. Branching may be a relationship rather than an entity state and
  needs a separate schema decision in Phase 2.3.
- Rewriting every archive file merely because the archive was opened.
- Replacing the tag dictionary or changing its configured soft/hard-limit behavior for new tags.

### 2.3 Canonical domain decisions

| Concern | Decision |
|---|---|
| Open-vocabulary labels | `tags[]` is canonical. New code does not persist `ai_topic` or `ai_concepts`. |
| Workflow status | Keep `open`, `closed`, `speculative`, `dead-end` as a separate optional enum. |
| Confidence | Keep `speculative`, `working`, `confident`, `validated` as a separate optional enum. |
| Summary | Keep `aiSummary` as prose and display it directly; do not convert it to a tag. |
| Provenance | Status/confidence values have `manual`, `generated`, or `legacy` origin. Unknown old values project as `legacy`. |
| Human precedence | A generated proposal cannot replace a manual value without field-specific approval. |
| Legacy reads | Reads project legacy labels into effective tags without writing the file. |
| Legacy writes | A successful explicit migration or later QA update persists effective tags and omits deprecated fields. |
| AI activation | Contextual hints are local. Network work starts only from an explicit confirmed action. |
| Suggestions | Generation and apply are separate operations joined by target version and content hash. |

## 3. Verified starting risks

The implementation may move while the original Phase 0 work is under way, so coding agents must
re-run the searches below before editing. At plan authoring time:

- `QAPairData` and `QAUpdateData` are duplicated across `src/types/QAPair.ts`,
  `electron/preload.ts`, and `electron/services/qaPairService.ts`; all expose `aiTopic`,
  `aiConcepts`, `aiStatus`, and `aiConfidence`.
- `shared/contracts/archive.ts` validates status/confidence but cannot explicitly clear them.
- `QAEditForm.vue` edits ordinary tags/content but not status or confidence.
- `QAMetadataBar.vue` displays status/confidence, while `aiSummary` is only a tooltip attached to
  `aiTopic`; retiring the topic would make the summary effectively invisible.
- `metadataService.ts` asks for topic, concepts, status, confidence, and summary, parses with an
  unchecked cast, and persists the result immediately.
- `qaPairService.ts` reads and rewrites `ai_topic`/`ai_concepts` unchanged.
- `healthService.ts` reports `missingTopic`, even though topic is being retired, and has no canonical
  readiness projection shared with other consumers.
- Semantic mode is visible in `QAListPanel.vue`, but index generation is discoverable primarily
  through commands/menu and documentation.
- Confidence annotation is reachable from the command palette/menu but has no contextual panel or
  Application Status affordance.

Before implementation, run:

```powershell
rg -n "aiTopic|aiConcepts|aiStatus|aiConfidence|ai_topic|ai_concepts|ai_status|ai_confidence" src electron shared tests
rg -n "Generate All Embeddings|Run Confidence Annotation Pass|Semantic|AI Metadata" src electron README.md
```

Do not overwrite or absorb in-progress Phase 0 work in `annotationService.ts`,
`llm/batchRunner.ts`, contracts, persistence, query, or command-registry code. Rebase this plan's
task branches on the merged Phase 0 implementation and adapt names while preserving the contracts
below.

## 4. Additional invariants

The relevant Phase 0 invariants remain in force alongside the Phase 0.8-specific rules below. Use
all of these as traceable test IDs:

| ID | Invariant |
|---|---|
| `INV-IPC` | Only the expected main frame can invoke privileged operations; every changed payload crosses one canonical runtime schema. |
| `INV-DATA` | The last valid archive file remains recoverable until a complete replacement has been validated and promoted. |
| `INV-ARCHIVE` | Metadata jobs, suggestions, migrations, filters, and readiness state cannot cross an archive switch. |
| `INV-COST` | Every provider call is explicitly initiated, capability/feature guarded, and metered through the shared usage path. |
| `INV-OBS` | Diagnostics expose stable codes and counts, never secrets, prompts, responses, QA bodies, URLs, or machine paths. |
| `INV-HUMAN` | Manual status/confidence is authoritative. Generation cannot overwrite it without explicit, field-level approval. |
| `INV-META` | Canonical labels, health counts, filters, and UI all read the same normalized metadata projection. |
| `INV-MIGRATE` | Legacy label migration is lossless, idempotent, atomic per QA, previewable, and never runs as a side effect of read/list/open. |
| `INV-SUGGEST` | Generation is read-only; apply validates schema, archive, entity version, and content hash immediately before writing. |
| `INV-NOCALL` | Passive UI operations and local readiness checks create no LLM, embedding, catalog, or other network request. |
| `INV-DISCOVER` | A feature with unmet prerequisites exposes the missing prerequisite and a safe next action instead of silently returning empty results. |

Use these IDs in test names, PR notes, and implementation handoffs.

## 5. Delivery sequence and task boundaries

Use focused PRs and stable task IDs. Do not implement the entire extension in one coding-agent
session.

```text
Original Phase 0 acceptance gate
  -> P08-T01 canonical metadata/provenance contracts
       -> P08-T02 legacy-label projection and migration
       -> P08-T03 manual editing and human precedence

Phase 0.5 query engine + P08-T01
  -> P08-T04 metadata facets and deterministic sorts

Phase 0.2 batch/review + Phase 0.6 flags + Phase 0.7 usage + P08-T01/T03
  -> P08-T05 read-only metadata suggestion/apply
       -> P08-T06 readiness/discoverability integration and final regression
```

| Task ID | Intended PR boundary | Primary dependencies |
|---|---|---|
| `P08-T01` | Canonical metadata types, clear semantics, provenance, and runtime contracts | Phase 0.0 IPC contracts and atomic persistence |
| `P08-T02` | Pure legacy projection, explicit archive migration, health migration status | P08-T01, atomic persistence/archive paths |
| `P08-T03` | Manual status/confidence UI and main-owned provenance rules | P08-T01, settings/edit renderer harness |
| `P08-T04` | Query facets, sort comparators, and QA filter UI | Phase 0.5, P08-T01 |
| `P08-T05` | Read-only suggestion envelope and explicit apply flow | Phase 0.2, 0.6, 0.7, P08-T01/T03 |
| `P08-T06` | Semantic/readiness/Application Status affordances, docs, E2E, migration soak | P08-T02/T04/T05, Phase 0.0 command registry/coordinator extraction |

Suggested branches use `codex/v2-p08-...`. Every task handoff must identify changed files, schema and
migration implications, tests and exact results, manual checks still required, unresolved risk, and
confirmation that unrelated worktree changes were preserved.

## 6. P08-T01 — canonical metadata and provenance contract

### Implementation

1. Put the QA metadata enums and projection types in one shared dependency-safe module. Renderer,
   preload, main, contracts, and tests import or derive from it rather than hand-copying unions.
2. Preserve the existing public property names `aiStatus`, `aiConfidence`, and `aiSummary` to keep
   the change targeted. Add read-only provenance fields such as `aiStatusSource` and
   `aiConfidenceSource` with values `manual | generated | legacy`.
3. Treat absent source on an existing persisted value as `legacy`. Do not guess that old data was
   generated even if generation was historically the only UI path; archives may be hand-edited or
   imported.
4. Allow `null` only in update commands to mean “clear this value.” Returned `QAPairData` uses
   absence, not `null`. Clearing a value also removes its persisted provenance.
5. Do not accept provenance as an arbitrary renderer-selected field. Main derives it from the
   operation: ordinary edit/manual-classification command writes `manual`; approved suggestion
   apply writes `generated`; legacy parser projection supplies `legacy`.
6. Add a main-owned workflow-metadata update function so internal generation and manual IPC do not
   call the same unqualified patch path. Validate enum, expected version, and archive identity before
   side effects.
7. Write new frontmatter source keys only when the associated value exists. Unknown provenance and
   malformed enum values fail closed and appear in archive health diagnostics rather than being
   coerced.

### Regression tests

- Contract tests for every enum, clear with `null`, omitted/no-change, strict-object rejection, and
  renderer attempts to forge provenance.
- Parser/serializer round trips for manual, generated, legacy, cleared, missing, and malformed data.
- Update tests proving a manual action writes manual provenance and clear removes value plus source.
- Compatibility tests proving immediately preceding archive files still load without mutation.
- Compile-time parity test proving renderer/preload/main use the canonical shared types.

### Exit gate

There is one enum/provenance contract, clear semantics are explicit, and only main determines value
origin.

## 7. P08-T02 — legacy label projection and migration

### Canonical projection

Implement a pure function over untrusted parsed frontmatter:

```text
projectLabels(persisted tags, ai_topic, ai_concepts, tag dictionary snapshot)
  -> effective tags
  -> legacy candidates and provenance
  -> validation/conflict diagnostics
  -> migratable yes/no with reason
```

Rules:

1. Preserve existing canonical tags first and in their current order.
2. Accept a legacy topic as one candidate and concepts only as a bounded array of strings. Invalid
   shapes are health errors, not strings coerced from objects.
3. Trim, Unicode-normalize, apply the repository's canonical tag normalization/alias resolution,
   discard empty values, and de-duplicate using the same comparison semantics as ordinary tags.
4. Append valid unique legacy candidates deterministically. Reads expose the result as effective
   `tags`; they also expose migration-pending state so derived tags are not mistaken for already
   persisted data.
5. Do not silently truncate at the contract limit. If the combined set cannot be represented, mark
   the QA blocked with a precise reason and leave the old file unchanged until user review.
6. Read/list/search/open is pure: no backups, writes, tag-dictionary mutation, timestamps, or version
   increments.

### Migration paths

Support both paths through the same pure projection and writer:

- **Next successful QA update:** persist the effective tags with the user's change, omit
  `ai_topic`/`ai_concepts`, preserve status/confidence/summary, and increment the QA version once.
- **Explicit archive migration:** Application Status offers a preview with affected, ready, already
  migrated, blocked, and invalid counts. After confirmation, make a recoverable migration backup,
  then process one QA as the durable unit. Yield and honor cancellation between QAs.

Additional rules:

1. Migration is idempotent; a second pass changes zero files and creates no duplicate tags.
2. Backups and writes use Phase 0's archive-path and atomic-file authority. A failed write retains
   the old QA and reports exact completed/failed/not-started counts.
3. Do not add migrated unknown labels to the tag dictionary silently. Resolve existing dictionary
   tags/aliases; report remaining new vocabulary in preview and reuse the existing blue/yellow
   review language. Acceptance persists the tag on the QA; dictionary addition remains an explicit
   reviewed choice governed by tag limits.
4. A rejected candidate must not be silently deleted with its legacy field. Record the user's
   resolution in the migration operation and remove deprecated fields only when every candidate has
   an accepted canonical destination or an explicit discard decision.
5. Remove `aiTopic`/`aiConcepts` from new write and metadata-generation contracts after the fallback
   and migration tests are green. Keep the read fallback for at least the v2 support window.
6. Replace `missingTopic` in health results with `missingTags`, `legacyLabelsPending`,
   `legacyLabelsBlocked`, and invalid legacy metadata counts. Do not classify a QA as missing tags
   when valid effective legacy labels are visible.

### Regression tests

- Table-driven pure projection tests: missing values, topic only, concepts only, mixed existing
  tags, casing/Unicode, aliases, blanks, duplicates, invalid scalar/array entries, deterministic
  order, maximum boundary, and over-limit block.
- Read-purity test snapshots file bytes/mtime/version and tag dictionary before and after list/open.
- Update migration round trip proving one version increment and deprecated-key removal.
- Explicit migration tests: preview only, accept/reject, cancel before and after a durable QA,
  idempotent rerun, backup failure, temp-write failure, promote failure, archive switch, and blocked
  record continuation/reporting.
- Search/filter tests proving effective legacy tags remain discoverable before disk migration.

### Exit gate

New writes contain no topic/concept fields; old labels remain visible and recoverable; migration is
lossless, explicit or write-coupled, atomic, cancellable, and idempotent.

## 8. P08-T03 — manual workflow metadata and human precedence

### Implementation

1. Add Workflow status and Confidence selectors to `QAEditForm.vue`, each with plain-language labels,
   short descriptions, and a visible “Not set” choice. Initialize from the selected pair and submit
   only intentional changes.
2. Keep keyboard behavior consistent with the current high-throughput edit flow. Tab order reaches
   both controls; Ctrl/Cmd+S saves; Escape cancels without mutation.
3. Display status, confidence, and their origin in `QAMetadataBar.vue`. Display `aiSummary` as readable
   text in a compact/collapsible block; do not hide it in a tooltip.
4. When a user edits either enum, main persists `manual` provenance. A manual value remains manual
   across unrelated QA edits.
5. If generation later proposes a different value, the UI shows current manual and proposed values
   side-by-side. The default is keep manual. Replacing it requires selecting that field and applying.
6. Do not write a correction/training log, send examples remotely, or claim the app has learned.
   Phase 2.3 may select local pairs explicitly marked manual as examples under a separately reviewed
   privacy and prompt-budget design.
7. Keep `branch` out of the selector. Add help copy explaining the current four statuses; record the
   branch taxonomy question as Phase 2.3 work rather than smuggling it into this migration.

### Regression tests

- Renderer tests for initial values, each option, clear, dirty tracking, save/cancel, keyboard flow,
  loading/error state, and no changes to tags/content when only metadata changes.
- Main tests for manual provenance, unrelated-edit preservation, explicit clear, malformed payload,
  version conflict, missing QA, and write failure.
- Human-precedence tests: generated apply fills missing, does not overwrite manual by default,
  explicit approved replacement works, and rejected proposal leaves bytes/state unchanged.
- E2E: set status/confidence, restart, edit ordinary content, clear one value, and verify display,
  provenance, persistence, command accessibility, and no provider call.

### Exit gate

Workflow metadata is fully usable offline, manual values are authoritative and identifiable, and the
summary is visible without relying on a retired field.

## 9. P08-T04 — query facets and deterministic sorting

### Query semantics

Extend the Phase 0.5 serializable QA query AST with:

- `status`: bounded set of status values plus `includeMissing`.
- `confidence`: bounded set of confidence values plus `includeMissing`.
- Optional provenance filters may be added to the pure engine for Phase 2.3, but do not crowd the
  Phase 0.8 UI unless there is a demonstrated operator workflow.

Rules:

1. Empty selected values with `includeMissing: false` is the identity/no facet, consistent with the
   existing query engine's empty-filter policy.
2. `includeMissing` matches absent values, not malformed values. Malformed archive data belongs in
   health diagnostics and is not silently recast as missing.
3. Multiple values within one facet are OR; separate facets combine with the query engine's existing
   AND semantics.
4. Define status order as `open`, `speculative`, `dead-end`, `closed`; define confidence order as
   `speculative`, `working`, `confident`, `validated`. These orders are presentation contracts, not
   claims that statuses are a linear lifecycle.
5. Missing values sort last in both ascending and descending directions. Ties use the existing
   selected secondary sort and finally QA ID for deterministic output.
6. The renderer, health report, and future batch target selection consume the same canonical
   projection and enum constants.

### UI integration

1. Add compact multi-select facets for Status and Confidence to the QA filter surface, with visible
   active-filter chips and one-action clear.
2. Add status and confidence sort options without changing the default sort.
3. Keep QA filter state separate from thread filter state. Phase 1.1's shared `ListFilterBar` must
   accept facets/sorts as configuration and must not move them into a global singleton.
4. Filtering/sorting is local over loaded metadata and makes no provider call.

### Regression tests

- Query-engine tests for every value, multiple values, missing behavior, status+confidence
  combinations, interaction with tags/text/date/source, malformed input, limits, serialization, and
  deterministic output.
- Sort tests for both directions, missing-last, every enum, equal values, invalid legacy values, and
  stable tie-breaking.
- Renderer tests for facet chips, clear, independent QA/thread state, persisted/session behavior as
  specified by the existing filter store, and zero network calls.
- Characterization tests proving the default query and sort return the same QA order as before.

### Exit gate

Status and confidence drive real retrieval workflows through one documented, bounded, deterministic
engine, and Phase 1 can extract the filter bar without changing their semantics.

## 10. P08-T05 — read-only metadata suggestions

### Suggestion contract

Replace “generate and save” with two distinct main-process operations:

```ts
interface SuggestionEnvelope<T> {
  operationId: string
  archiveId: string
  targetId: string
  targetVersion: number
  contentHash: string
  providerId: string
  modelId: string
  createdAt: string
  suggestion: T
}
```

The exact shared type may differ, but all fields and semantics above are required. Do not include
prompt text, response text, URLs, secrets, or QA content in the envelope/usage ledger.

### Generation

1. Change the current metadata prompt/output to status, confidence, and summary only. Topic/concepts
   are retired; Phase 2.2 later adds reviewed tag candidates through the canonical tag flow.
2. Runtime-validate the structured LLM response. Reject unknown enums, oversized summary, extra or
   missing required fields, malformed JSON, and mixed-target output with stable safe codes.
3. Capture archive identity, QA version, and a hash of the title/question/answer used for generation.
4. Generation performs no QA/tag/thread write. It may write only the privacy-preserving Phase 0.7
   usage record required for the physical provider call.
5. Require an explicit user action, Phase 0.6 feature enablement where applicable, completion
   capability, configured provider/model, and Phase 0.7 warning/limit approval before the call.
6. Use the Phase 0.2 runner/review shell for lifecycle, cancellation, progress, cleanup, and eventual
   batch compatibility; do not build a second feature-specific state machine.

### Apply

1. Let the user approve status, confidence, and summary independently and edit proposed enum values
   before apply.
2. Immediately before writing, main reloads the target and validates archive ID, version, and content
   hash. A stale proposal returns `suggestion-stale` and writes nothing.
3. Generated values receive `generated` provenance. Existing manual values are unchecked by default
   and require an explicit replace selection plus confirmation.
4. Apply one QA atomically. Report approved, skipped, stale, failed, and unchanged fields precisely.
5. Suggestions expire with the batch-runner owner/TTL lifecycle and are cleared on archive switch,
   target deletion, reload, or successful apply.

### Regression tests

- Provider-output tests for valid response, malformed JSON, extra keys, invalid enums, oversized
  summary, empty output, cancellation, rate limit, and safe/redacted errors.
- Generation-purity test snapshots QA/thread/tag files and in-memory stores; only one metered physical
  call may change accounting.
- Apply tests for selected fields, no selection, manual precedence, explicit replacement, version
  stale, content-hash stale, archive switch, deleted target, TTL, repeated apply, and atomic failure.
- Renderer review tests for compare/current/proposed state, keyboard approval, cancel/retry, manual
  warning, stale rendering, and listener cleanup.
- E2E with a fake provider proves no click means zero calls, cancel-before-confirm means zero calls,
  generation does not persist, and approved apply survives restart.

### Exit gate

The old immediate-write metadata path is gone; every generated value is validated, reviewable,
stale-checked, explicitly applied, human-precedence-aware, and metered once per physical call.

## 11. P08-T06 — readiness and contextual activation

### Central readiness projection

Create one main-owned, read-only readiness service/result consumed by Application Status and relevant
renderer surfaces. It reports counts and capability state only—never content or IDs unless a
specific drill-down action already has a safe contract.

Required fields:

- Total QA count.
- Valid embedding coverage: ready, missing, stale/incompatible, and currently running. “Valid” uses
  Phase 0's archive/provider/model/dimension identity, not mere presence in a JSON file.
- Workflow coverage: status missing/manual/generated/legacy and confidence equivalents.
- Legacy label migration: pending, blocked, invalid, and migratable counts.
- Completion and embedding readiness: enabled feature, selected provider capability, configuration
  present, and a stable disabled reason. Do not expose secret values.

Use one archive scan/snapshot per refresh where practical. Do not have each component rescan the
archive or interpret provider capability independently.

### Contextual surfaces

1. **QA metadata bar:** when status/confidence is missing, show compact local actions to set manually
   or request a suggestion. Do not add a large persistent banner or displace primary Edit/Create
   actions. Manual set is always available; Suggest explains disabled prerequisites.
2. **Semantic search:** show `ready / total` coverage near the mode. At zero/partial coverage, show
   Generate/Continue indexing. With an embed-incapable provider, show the exact capability problem
   and link to Settings. Do not run indexing when the mode is selected.
3. **Application Status:** add an AI readiness section with the counts above and actions for Generate/
   Continue embeddings, Review missing confidence, and Preview legacy-label migration.
4. **Confidence annotation:** preserve command/menu access and add the Application Status action. If
   an individual QA lacks confidence, its metadata affordance can open single-item review/manual set.
5. **Commands and menus:** route every action through the canonical command registry. Components call
   typed actions/composables; do not restore the legacy `llm:*` DOM event bus removed during Phase
   0 stabilization.
6. **Nudges:** base visibility only on local missing/readiness state. Provide a non-destructive way to
   dismiss contextual suggestions for the session; do not persist per-QA dismissal metadata in
   archive files. The ordinary metadata controls remain discoverable after dismissal.

### Regression tests

- Readiness-service tests for empty archive, full/partial/stale embedding coverage, capability and
  configuration combinations, concurrent job state, legacy migration counts, malformed records,
  archive switch, and redaction.
- Renderer tests for each contextual surface, disabled reasons, session dismissal, action routing,
  loading/error refresh, compact layout at minimum supported window size, and keyboard access.
- `INV-NOCALL` spies around QA selection, app launch, Application Status open, filter use, Semantic
  mode selection, readiness refresh, and prompt dismissal.
- Command-registry/menu tests for unique IDs, visibility, enabled state, and dispatch parity.
- E2E: zero-index Semantic path → explicit fake indexing → coverage update → semantic result; missing
  confidence → manual set and batch-review entry; legacy preview → cancel → apply → restart.

### Exit gate

Users can see feature readiness and reach the correct next action in context; unmet prerequisites are
explained; passive discovery remains local and free.

## 12. Cross-cutting regression program

### 12.1 Required automated coverage

| Suite | Required coverage |
|---|---|
| Shared/unit | Enums, provenance, clear semantics, legacy projection, migration, query facets, sorts, readiness projection, suggestion schema/staleness. |
| Main/service | Atomic migration/apply, human precedence, archive/version guards, cancellation, redaction, exact usage metering. |
| Renderer/jsdom | Edit controls, metadata display, filters, review state, contextual affordances, disabled reasons, no-call behavior, command routing. |
| IPC/contracts | New/changed channels, strict payloads, sender enforcement, bounded results, safe error codes, renderer provenance forgery rejection. |
| Electron smoke E2E | Manual offline workflow, legacy compatibility/migration, suggestion review, Semantic readiness, restart persistence. |
| Full/visual E2E | User-run pre-push when affected, per `AGENTS.md`; do not run automatically during ordinary implementation. |

### 12.2 Destructive/failure matrix

Apply Phase 0's atomic persistence, archive isolation, validated IPC, and safe-observability rules
plus the Phase 0.8-specific failure points below:

| Failure point | Required assertion |
|---|---|
| Legacy parse/projection | File and dictionary unchanged; health reports a safe reason. |
| Migration preview | No file, version, dictionary, or mtime change. |
| Migration backup/write/promote | Old file recoverable; completed/failed counts exact; rerun safe. |
| Manual metadata save | Provenance and value commit together or neither does. |
| Suggestion generation | No archive mutation even on valid completion. |
| Suggestion apply after content edit | `suggestion-stale`; no partial field apply. |
| Manual value exists | Generated replacement remains opt-in and field-specific. |
| Readiness refresh fails | Existing UI state remains safe; no provider call or fabricated “ready” state. |
| Archive switch mid-review/migration | Old captured archive is cancelled or completed against its snapshot; never writes to the new archive. |

## 13. Manual regression and soak pass

Use copied/sanitized archives, never the only production archive.

1. Open an archive containing: no AI fields, every valid legacy combination, mixed tags/legacy
   labels, malformed values, maximum tags, and an over-limit record. Confirm no files change on open.
2. Edit one legacy QA and verify effective tags persist, deprecated fields disappear, the version
   increments once, and all other metadata/content remains byte-equivalent after parsing.
3. Preview the archive migration, cancel it, run it, force-stop a copied run between QAs, restart,
   and rerun. Confirm recovery, no duplicates, and accurate readiness/health counts.
4. Set/change/clear status and confidence with keyboard only. Restart and confirm provenance and
   values. Make an unrelated edit and confirm manual origin remains.
5. Use a fake provider to generate a conflicting proposal for a manually classified QA. Verify keep
   manual is the default, explicit replacement is required, and stale content prevents apply.
6. Enter Semantic mode with zero, partial, full, and incompatible embeddings. Confirm accurate
   coverage and disabled reasons; only the explicit Generate/Continue action starts work.
7. Exercise status/confidence filters and sorts with missing and every enum value, then use the
   thread list and confirm its state is independent.
8. Resize to the minimum supported window and confirm contextual actions remain compact, primary
   Edit/Create actions stay discoverable, and keyboard/menu/command paths agree.
9. Review logs and Application Status for archive bodies, QA IDs, prompts/responses, URLs, keys, and
   local paths. None may appear in new readiness, suggestion, or migration diagnostics.

Record OS, archive size, legacy-record counts, migration duration, cancellation point, recovery
result, embedding coverage, provider type, and exact validation commands.

## 14. Documentation and compatibility updates

The final integration PR must:

1. Update README workflow sections for manual classification, reviewed AI suggestions, Semantic
   readiness/index generation, metadata filters, and legacy migration.
2. Update in-app help, command/menu labels, Application Status copy, and any health-report labels.
3. Update `doc/dev_process/build-notes.md` with shipped behavior and schema compatibility decisions.
4. Mark the old immediate-write `AI Metadata` behavior and topic/concept schema as superseded in
   relevant dated plans; do not rewrite historical audit evidence.
5. Confirm import/export documentation describes effective tags and retained read compatibility.
6. State that passive readiness is local, AI calls require explicit action, and manual labels are not
   uploaded or used for training by Phase 0.8.

## 15. PR checklist and final acceptance

Each PR must include:

- A narrow task ID and named invariants.
- Tests with at least one boundary/failure/no-call case.
- Required baseline and post-edit `npm run build` results plus focused test commands.
- Manual reproduction notes for visible workflow changes.
- Build notes and user-facing docs when behavior lands.
- Schema/migration/rollback notes.
- Confirmation that unrelated Phase 0 worktree changes were preserved.

Final Phase 0.8 acceptance checklist:

- [ ] One shared workflow metadata/provenance contract is used across renderer, preload, main, and tests.
- [ ] Manual status/confidence set/change/clear works offline and survives restart.
- [ ] Generated values cannot silently replace manual values.
- [ ] `aiTopic`/`aiConcepts` are absent from new writes and generation responses.
- [ ] Old topic/concept fields remain visible through effective tags before migration.
- [ ] Read/list/open causes no migration write.
- [ ] Explicit and next-write migration are lossless, atomic, cancellable, idempotent, and recoverable.
- [ ] Health and readiness report canonical tag and pending-migration state, not `missingTopic`.
- [ ] Status/confidence filters and sorts have documented missing/order/tie semantics.
- [ ] QA and thread filter state remains independent.
- [ ] AI summary is directly visible.
- [ ] Metadata generation is read-only until reviewed apply and rejects stale targets.
- [ ] Semantic search exposes valid index coverage and an explicit Generate/Continue action.
- [ ] Confidence review and legacy migration have contextual Application Status entry points.
- [ ] Passive UI/readiness actions make zero provider/network calls.
- [ ] Every call is capability-gated, feature-guarded, explicitly initiated, and metered.
- [ ] Automated gates and the focused manual soak pass are green.
- [ ] README, in-app help, menus, health report, Application Status, build notes, and roadmap agree.

Phase 1 starts only after this checklist is green; its shared filter-bar work must preserve the new
facets. Phase 2 starts only after this checklist is green; its title/tag/workflow features must use
the canonical tags, provenance, suggestion, approval, readiness, and no-surprise-call contracts
defined here.
