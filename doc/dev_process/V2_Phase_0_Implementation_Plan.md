# V2 Phase 0 — Detailed Implementation and Regression Plan

**Status:** Implementation-ready plan  
**Prepared:** 2026-07-31  
**Target branch:** `vlads-dev`  
**Scope:** `V2_Master_Roadmap.md` Phase 0 only (`0.0` through `0.7`)  
**Starting commit reviewed:** `fbb570b` (`1.4.1`)

## 1. Purpose and exit condition

Phase 0 is the stability floor for v2. Its purpose is not to deliver Phase 1 or Phase 2 product features. It must make later work safe to add by establishing validated boundaries, recoverable persistence, bounded remote/import work, explicit provider capabilities, reusable batch/selection/undo/query infrastructure, feature gates, and LLM usage accounting.

Phase 0 is complete only when all of the following are true:

1. A malformed renderer message, imported file, remote response, model response, or persisted control file cannot become an unchecked filesystem, network, or destructive operation.
2. A process crash, disk-full condition, permission failure, or corrupt load cannot silently replace the last readable archive/control state with an empty or partial state.
3. Long-running imports and LLM jobs are bounded, yield to Electron's event loop, expose progress, and support real cancellation.
4. An archive switch cannot reuse another archive's tags, embedding index, undo history, selection, preview, or in-flight work.
5. Secrets never return to the renderer, never appear in logs/errors, are not described as secure when Electron is using Linux `basic_text`, and legacy plaintext is removed only after a verified migration.
6. LLM functionality is selected by declared capability, not provider-name checks or an expected runtime exception.
7. Experimental or cost-incurring functionality is off by default, guarded again in main, and metered through one usage path.
8. The regression suite covers normal behavior, boundary inputs, injected failures, migration, cancellation, and rollback. The required automated gates and the manual Windows/Electron soak pass are green.

## 2. Sources and scope decisions

This plan expands and reconciles:

- `doc/plans/V2_Master_Roadmap.md`, especially Phase 0.
- `doc/dev_process/Release_Architecture_and_Stability_Review_2026-07-27.md`.
- `doc/dev_process/Release_1.4_Implementation_Plan.md`, especially Part 3 and decisions D1–D7.
- The current `vlads-dev` implementation and tests at `fbb570b`.

The scope decisions already recorded in the 1.4 plan remain authoritative:

- Phase 0 implements persistence safety properties, not the later wholesale migration to a main-owned domain repository.
- Bulk import uses idempotent re-run plus incremental durable thread saves; it does not add a staging manifest/resume subsystem.
- Preview memory is controlled with aggregate budgets, ownership, expiry, and cleanup; it is not spilled to a second temporary-file lifecycle.
- `safeStorage` remains synchronous for Phase 0.
- Signing and artifact provenance remain Phase 5.
- `g.co` short-link support is a feature outside this plan. Phase 0 secures currently supported direct provider URLs and redirect behavior.

No Phase 1 feature (thread-list filters, result highlighting, context menus, favorites, tray icon, and so on) is implemented here. Phase 0 may add internal UI primitives that Phase 1 can consume, but must not absorb Phase 1 scope.

## 3. Verified starting point

### 3.1 Baseline results

- Current branch: `vlads-dev`.
- `npm run build`: passes.
- `npm run check`: currently fails in `tests/unit/parserBudgets.test.ts`; the smartquotes fixture took about 23 seconds against a 2-second ceiling. The run reached 227 passing tests, one failing test, and one platform-dependent skip before stopping.
- `package-lock.json` records patched parser versions (`markdown-it 14.3.0`, `linkify-it 5.0.2`, gray-matter's nested `js-yaml 3.15.0`, and `postcss 8.5.24`), but the installed `node_modules` tree reports older versions. The first Phase 0 action is therefore a clean `npm ci` and a repeat of the budget test. Do not increase the time ceiling to make the test green; first prove whether the failure is stale installation, runtime regression, or machine-specific performance.
- The production audit could not be re-run in the restricted review environment because the npm audit endpoint was unavailable. It remains a required clean-environment gate.
- The repository contains Node/Vitest unit tests, Electron Playwright tests, and visual snapshots. It does not contain a jsdom renderer-unit project or a checked-in `.github/workflows/ci.yml` workflow.
- Persistent Playwright and visual suites were not run during this planning pass, in accordance with `AGENTS.md`.

### 3.2 Current code risks Phase 0 must close

| Area | Current implementation | Phase 0 implication |
|---|---|---|
| Electron | `electron 33.4.11`, `electron-builder 25.1.8` | Electron is unsupported; upgrade first and isolate the dependency/tooling change. |
| IPC | 51 `ipcMain.handle` registrations in `electron/ipc/handlers.ts`; handlers TypeScript-cast arguments and do not validate senders | Add one canonical contract and one wrapper that performs sender, frame, and runtime payload validation for every channel. |
| Remote import | `fetchJson()` follows redirects automatically, has no timeout or byte ceiling; Gemini uses a hidden window without a unique partition or redirect policy | Add a shared bounded transport and a contained, non-persistent Gemini session. |
| Persistence | Direct writes in settings, threads, tags, embeddings, model cache, secrets, QA files, and exports | Add a tested same-directory atomic-write primitive and explicit failed-load state before migrating each writer. |
| Load failures | Settings/tags/embeddings can fall back to writable defaults/empty state; thread load throws and the renderer can later save `{}` | Distinguish missing from corrupt/unreadable, quarantine invalid data, and block writes until repair/reload. |
| QA lookup | `getPair()` parses the whole archive; duplicate IDs overwrite earlier entries in `listAllPairs()` | Build a validated id-to-path index per archive and report parse/duplicate problems through health data. |
| Paths/indexes | `pathResolver.ts` only resolves the data root; tags use a different resolver; embeddings live globally in `userData` | Introduce one `ArchivePaths` snapshot and namespace/version derived indexes by archive/provider/model/dimensions. |
| Bulk import | Preview identity is time + `Math.random`; selection uses provider `sourceId`; commit is synchronous; thread state saves once at the end; cancel only releases an unused preview | Add opaque row/preview IDs, budgets, owner/TTL, numeric shard validation, async yielding, incremental atomic saves, and an abort signal. |
| Secrets | `isEncryptionAvailable()` is the only security check; envelope write is direct; legacy plaintext is renamed and left behind | Reject Linux `basic_text`, write atomically, and migrate/verify/purge legacy files without exposing values. |
| Settings | UI persists settings before secrets; connection tests persisted state; catalog responses can race; data-directory change activates before validation | Implement one tested draft state machine and explicit main-side validation/apply/test commands. |
| LLM layer | One `LLMProvider` requires both completion and embedding; Anthropic `embed()` throws; Anthropic uses hand-written `fetch` | Split capabilities/interfaces, validate model ownership, use the Anthropic SDK, then add Ollama/Azure adapters. |
| Batch LLM | Annotation is a hard-coded sequential loop and one feature-specific dialog; no cancellation/staleness check | Extract a generic bounded job runner and review shell before Phase 2 consumers exist. |
| Selection | Stores carry one selected QA/thread ID only | Add an independent, reusable ordered multi-selection model while preserving the existing primary item. |
| Undo | Mutations call IPC and then directly mutate Pinia state; no history or compensation | Add serialized command execution, recoverable deletion, stale-state checks, and bounded session history. |
| Querying | Search is feature-specific; no reusable predicate representation | Add a pure, deterministic query AST/compiler with explicit semantics and limits. |
| Feature flags | `lensEnabled` is a single feature setting, not a general experiment facility | Add stable, default-off flags validated in renderer and main. |
| Usage | `tokenTracker.ts` is an in-memory token counter with no call count, model attribution, estimate, or single enforcement path | Replace with a centralized, privacy-preserving session usage ledger and guard. |

## 4. Stability and security strategy

### 4.1 Trust boundaries

Treat all of the following as untrusted even when they normally originate locally:

- Every IPC sender, frame, channel argument, and renderer-provided object.
- Every archive Markdown/frontmatter file and JSON control file. Users can sync, copy, or hand-edit them.
- Every ZIP/folder entry, provider export, shared URL, redirect, header, and response body.
- Every LLM response, including IDs and enum-like values the prompt asked the model to preserve.
- Provider/model catalog results and delayed asynchronous responses.
- Filesystem success assumptions: disk space, permissions, antivirus locks, OneDrive races, and process interruption.
- Time, ordering, cancellation, duplicate IDs, missing IDs, and repeated actions.

Main-process code is the authority for filesystem paths, remote destinations, secret resolution, feature enablement, budget enforcement, and destructive operations. Renderer checks exist for usability but are never the security control.

### 4.2 Non-negotiable invariants

Assign these IDs to tests and PR notes so every Phase 0 change states which invariants it preserves.

| ID | Invariant |
|---|---|
| `INV-IPC` | Only the expected main application's main frame can invoke privileged channels; every argument and result crosses a canonical runtime schema. |
| `INV-PATH` | A renderer/import value cannot choose an arbitrary filesystem location or escape an approved root; paths are resolved once from an `ArchivePaths` snapshot. |
| `INV-DATA` | The last valid target file remains recoverable until a complete replacement has been written and promoted. Missing, corrupt, and unreadable are distinct states. |
| `INV-LOAD` | A failed load cannot later be overwritten by a default/empty projection without an explicit repair action. |
| `INV-IMPORT` | Imports are bounded, deterministic, idempotently recoverable, owner-bound, cancellable between durable units, and never silently partial. |
| `INV-NET` | Remote imports use approved HTTPS endpoints, bounded redirects/time/body, denied permissions/popups, and token-redacted diagnostics. |
| `INV-SECRET` | Raw keys stay in main memory, are redacted from all diagnostics, and are persisted only through a verified secure backend and atomic envelope write. |
| `INV-ARCHIVE` | Archive-specific cache/index/job/selection/undo state cannot cross an archive switch. |
| `INV-LLM` | A call is made only through an adapter that declares the requested capability; model/provider ownership and structured outputs are runtime-validated. |
| `INV-COST` | Every LLM/embed call passes through one metered guard; cost-bearing experiments are opt-in and provide estimates/warnings before fan-out. |
| `INV-UNDO` | History records only successfully committed mutations; an undo failure cannot cause later commands to run on assumed state. |
| `INV-OBS` | Failures return stable codes and safe context; logs contain operation IDs and counts, never secrets, share tokens, full prompts, or imported bodies. |

### 4.3 Failure behavior

Use the following uniform policy:

1. Validate before side effects.
2. For multi-step changes, capture the previous durable state or a compensating token before the first write.
3. Commit the smallest durable unit and report it precisely. Never return success before required writes complete.
4. If a load is corrupt, retain the original and enter read-only/repair-required state. Do not auto-save defaults.
5. If a remote/import limit is crossed, abort the whole preview with a structured limit code. Do not truncate silently.
6. Cancellation means “stop before the next durable unit.” Report what completed and make re-run safe through `origin_id`.
7. A rollback failure is a first-class `needs-repair` result and disables further writes until reload/repair.
8. Unknown schema versions, feature flags, providers, capabilities, and error codes fail closed.

### 4.4 Migration and rollback policy

- Every on-disk schema gets an integer `schemaVersion` and a pure validation/migration function.
- Reads remain backward-compatible for the immediately preceding format. Writes use only the new format after validation.
- Before the first migration, create a sibling timestamped backup through the atomic-file layer. Never migrate an already-invalid source.
- Migrations must be idempotent and tested by running them twice.
- Record migration outcome and archive identity, but not content, in diagnostics.
- A Phase 0 PR must be independently revertible. Do not mix the Electron/builder upgrade, persistence migration, or provider adapters with unrelated UX refactors.
- Feature flags for unfinished Phase 0 consumers remain off after rollback and upgrade.

## 5. Delivery sequence and branch discipline

The order below is mandatory where a dependency arrow is shown.

```text
P0-A baseline/clean install
  -> P0-B Electron + builder upgrade (alone)
  -> P0-C test harness + shared contracts + IPC guard
  -> P0-D atomic file primitive + failed-load model + ArchivePaths
       -> P0-E remote import containment
       -> P0-F bulk import durability/cancellation
       -> P0-G secrets migration
       -> P0-H settings draft
       -> P0-I LLM capability split/Anthropic SDK
            -> 0.1 Ollama/Azure adapters
            -> 0.2 batch runner

0.3 selection -> 0.4 undo/command infrastructure
0.5 query engine
0.6 feature flags -> 0.7 usage guardrails

Final cross-cutting regression + soak gate
```

Recommended short-lived branches use the repository prefix and one concern per PR, for example `codex/v2-p0-electron-43`, `codex/v2-p0-ipc-contracts`, and `codex/v2-p0-atomic-persistence`. Merge only after the prior dependency gate is green. Rebase each branch on the latest tested `vlads-dev`; do not stack later work on an unmerged persistence or contract branch.

### 5.1 Referencable implementation tasks / sub-phases

Do not implement all of Phase 0 in one coding-agent session. Use one coordinating task to track the initiative, but give each row below its own implementation task and focused branch/PR. Refer to these stable IDs (`P0-T01`, `P0-T02`, and so on) in prompts, commits, reviews, and handoffs. The model recommendation is an execution aid rather than part of the technical contract; re-check current model availability before starting, while keeping the task IDs and scopes stable.

| Task ID | Roadmap scope | Implementation task / intended PR boundary | Recommended coding model and reasoning |
|---|---|---|---|
| `P0-T01` | P0-A | Clean dependency baseline, parser-budget regression, and CI gate | GPT-5.6 Sol, high |
| `P0-T02` | P0-B | Electron and electron-builder upgrade only | GPT-5.6 Sol, high |
| `P0-T03` | P0-C | Shared contracts, runtime payload validation, and IPC sender/frame guard | GPT-5.6 Sol, xhigh |
| `P0-T04` | P0-D | Atomic-file primitive and deterministic filesystem failure-injection harness | GPT-5.6 Sol, xhigh |
| `P0-T05` | P0-D | Failed-load barriers, persisted schemas/migrations, QA index, and `ArchivePaths` | GPT-5.6 Sol, xhigh |
| `P0-T06` | P0-E | Bounded shared-link transport and Gemini hidden-window containment | GPT-5.6 Sol, xhigh |
| `P0-T07` | P0-F | Bulk-import limits, preview ownership/TTL, durability, yielding, and cancellation | GPT-5.6 Sol, xhigh |
| `P0-T08` | P0-G | Secret-backend hardening, atomic envelope, and verified legacy migration/purge | GPT-5.6 Sol, xhigh |
| `P0-T09` | P0-H | Settings draft state machine, validation, coherent apply/rollback, and catalog-race protection | GPT-5.6 Sol, xhigh |
| `P0-T10` | P0-I | LLM capability split, provider/model validation, and Anthropic SDK migration | GPT-5.6 Sol, high |
| `P0-T11` | 0.1 | Ollama adapter and its loopback/network-policy tests | GPT-5.6 Sol, high |
| `P0-T12` | 0.1 | Azure OpenAI adapter, configuration contract, and endpoint-policy tests | GPT-5.6 Sol, high |
| `P0-T13` | 0.2 | Generic batch runner/review shell, followed by confidence-annotation migration | GPT-5.6 Sol, high; xhigh for apply/cancellation review |
| `P0-T14` | 0.3 | Shared QA/thread multi-selection model and renderer regression coverage | GPT-5.6 Terra, high, or Sol, high |
| `P0-T15` | 0.5 | Pure query/filter engine and generated/property regression cases | GPT-5.6 Terra, high, or Sol, high |
| `P0-T16` | 0.4 | Serialized undo/redo manager, recoverable deletion, compensation, and stale-state handling | GPT-5.6 Sol, xhigh |
| `P0-T17` | 0.6 | Versioned experimental-feature settings and duplicate main-process enforcement | GPT-5.6 Sol, high |
| `P0-T18` | 0.7 | Central LLM usage ledger, estimates, limits, redaction, and status surfacing | GPT-5.6 Sol, high |
| `P0-T19` | P0-J | Command/import coordinator refactors and documentation reconciliation | GPT-5.6 Terra, medium/high, followed by Sol review |
| `P0-T20` | Final gate | Independent security/data-integrity review, full regression, Windows packaging, and soak evidence | Fresh GPT-5.6 Sol task, xhigh |

The IDs are reference labels, not permission to ignore the dependency order below. The current model positioning follows [OpenAI's model guidance](https://developers.openai.com/api/docs/guides/latest-model) and [model catalog](https://developers.openai.com/api/docs/models); use Sol for the security-, persistence-, migration-, and concurrency-sensitive work, while Terra is suitable for tightly specified lower-risk/mechanical tasks.

Dependency rules for these task IDs:

- `P0-T01` must be green before product changes begin.
- `P0-T02` lands alone, then `P0-T03`, then `P0-T04` and `P0-T05` in order.
- `P0-T06` through `P0-T10` start only from the merged/tested contract and persistence foundation. Keep them sequential when they touch the same services.
- `P0-T11` and `P0-T12` require `P0-T10`. `P0-T13` requires `P0-T10`, `P0-T17`, and the metering contract from `P0-T18` to be defined; implementation order may place `P0-T17`/`P0-T18` earlier than their numeric task labels.
- `P0-T14` and `P0-T15` may proceed independently in separate worktrees after `P0-T03`. `P0-T16` requires `P0-T04`, `P0-T05`, and `P0-T14`.
- `P0-T19` is deliberately late so coordinator extraction targets settled APIs rather than creating churn during boundary changes.
- `P0-T20` must be performed from a fresh task that did not author all the underlying changes. It reviews and reports first; it does not silently rewrite failed security or migration designs.

Every implementation task must end with a handoff recording changed files/behavior, migrations and compatibility implications, tests added, exact validation commands/results, manual checks still required, unresolved risks, and confirmation that unrelated working-tree changes were preserved. Existing single-item behaviors and other phase boundaries remain in force even when a task discovers adjacent improvement opportunities.

## 6. Phase 0.0 — stabilization carry-over

### P0-A. Re-establish a trustworthy baseline

Implementation steps:

1. On a clean checkout, run `npm ci`; prove `node_modules` matches the lockfile with a small script/assertion for the four imported-content parser versions.
2. Run the smartquotes budget test by itself three times, then the full `npm run check`. If it remains slow with `markdown-it 14.3.0`, profile it and fix the application/parser configuration or fixture size based on a measured linearity test. Do not merely raise the ceiling.
3. Add `.github/workflows/ci.yml` because it is absent from the current tree. Use a supported Node LTS, `npm ci`, and `npm run check`; cache npm downloads, not `node_modules`.
4. Add a lockfile/install consistency test or CI step (`npm ci` already supplies the primary guarantee) and print resolved security-sensitive package versions in CI diagnostics.
5. Capture baseline results for `npm run build`, `npm run check`, and focused Playwright smoke tests in the PR notes. Persistent UI/visual suites remain a user-run pre-push gate.

Regression coding:

- Refactor `tests/unit/parserBudgets.test.ts` to measure scaling (for example, compare N and 2N inputs with a generous ratio ceiling) in addition to an absolute timeout. Warm the parser once before timing and use repeated samples/median to reduce cold-start noise.
- Keep hard maximum input-size guards in application code; a performance regression test is not itself a runtime budget.
- Add `tests/unit/dependencyVersions.test.ts` only if CI cannot reliably expose resolved versions; otherwise prefer the clean-install gate over a brittle version assertion.

Exit gate: a clean `npm ci && npm run check` is green on Windows and CI, and the parser test completes with repeatable margin.

### P0-B. Upgrade Electron and electron-builder first and alone

As of this plan, Electron officially supports the latest three stable majors, Electron 43 is stable, and its scheduled EOL is 2027-01-05. Re-check the official schedule at implementation time; use the latest supported stable major compatible with the documented OS audience. The roadmap target is Electron 43, not a prerelease. Electron 44 removes Windows 32-bit and macOS 12 support, so moving beyond 43 requires an explicit audience decision rather than an automatic bump.

Implementation steps:

1. Record supported OS/architecture policy in `README.md` before choosing the target. Confirm whether Windows x64 only is acceptable and whether macOS 12 must remain supported.
2. Update Electron one major at a time in a disposable local sequence to identify the first break, but commit only the final supported target and required compatibility edits.
3. Update `electron-builder` from 25 to 26 in the same isolated upgrade PR because packaging compatibility is coupled to the runtime jump.
4. Adapt `electron/main.ts`'s `console-message` listener to the current event shape and audit every used API against Electron's breaking-change guide.
5. Preserve explicit `sandbox: true`, context isolation, disabled Node integration, navigation denial, popup denial, and permission denial. Confirm preload still loads in packaged and dev modes.
6. Preserve `electron-builder.yml`, Vite `.mts` configs, ASAR rules, and the Windows `ffmpeg.dll` runtime assumption.
7. Do not add providers, refactor persistence, or change UI behavior in this PR.

Regression coding and verification:

- Add/update a focused Electron launch test that asserts the renderer loads, preload API exists, dev/prod origin policy works, a basic QA round trip succeeds in an isolated directory, and the app exits cleanly.
- Add a Playwright security smoke that attempts a remote same-window navigation and `window.open`, confirming both are denied and the original app remains functional.
- Exercise file dialogs through stubs in unit tests; do not automate native dialog clicks in the default suite.
- Run `npm run check`, `npm run test:e2e -- --grep @smoke`, `npm run electron:build:win`, and the MSI lifecycle script on a Windows VM or host.
- Manually launch unpacked, NSIS, and MSI builds; create/edit/delete/import/export a QA; verify external links open in the system browser; verify uninstall/reinstall/upgrade behavior and the presence of `ffmpeg.dll`.

Exit gate: no unsupported Electron line, no deprecation warnings from used APIs, green Windows packages, and documented OS floors. Official references: [Electron support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines), [release schedule](https://releases.electronjs.org/schedule), and [breaking changes](https://www.electronjs.org/docs/latest/breaking-changes/).

### P0-C. Canonical contracts, runtime validation, and sender guard

Target structure:

```text
shared/contracts/
  channels.ts          # channel constants, no free-form strings
  common.ts            # IDs, bounded strings, safe error/result envelopes
  settings.ts
  archive.ts
  import.ts
  llm.ts
  tags.ts
  index.ts
electron/ipc/
  registerValidatedHandler.ts
  senderPolicy.ts
```

Implementation steps:

1. Add `zod` as a runtime dependency. Keep schemas in `shared/contracts`; infer TypeScript types from schemas rather than copying interfaces.
2. Inventory all 51 channels and classify each as query, mutation, destructive mutation, dialog/shell, or event. Define argument tuple schema, return schema, and stable error codes for every channel.
3. Reconcile known drift: `includeDateInThreadNames`, `originId`, `AppSettings`, provider/model descriptors, and bulk-import progress/result shapes.
4. Replace `registerIpcHandlers()` with a registration function that receives the expected main `WebContents`/window identity. The wrapper must require `event.sender === expectedWebContents`, `event.senderFrame === event.sender.mainFrame`, and an allowed application URL/origin.
5. Parse arguments before calling service code. Use `.strict()` for filesystem, secret, settings, import-selection, and destructive payloads; impose string/array/numeric bounds. Reject non-finite numbers and prototype-bearing/unexpected fields.
6. Return a serializable result envelope with stable codes such as `invalid-sender`, `invalid-payload`, `not-found`, `load-corrupt`, `write-failed`, `cancelled`, `limit-exceeded`, and `needs-repair`. Do not return raw stack traces or provider bodies.
7. Build the preload API from the channel constants and inferred types. Remove duplicate declarations from `electron/preload.ts`, `src/global.d.ts`, service-local definitions, and component-local interfaces.
8. Validate main-to-renderer event payloads (`menu-action`, import progress, future batch progress) at the receiving boundary too.
9. Keep filename/path sanitization inside main even after schema validation; validation and path containment are separate controls.

Regression coding:

- `tests/unit/ipcSenderPolicy.test.ts`: expected main frame accepted; wrong `webContents`, subframe, destroyed sender, remote URL, and file/dev origin mismatch rejected.
- `tests/unit/ipcContracts.test.ts`: table-drive every channel with valid payload, missing fields, unknown fields, overlong strings/arrays, `NaN`/infinity, traversal-shaped IDs/source values, and wrong discriminants.
- Add a compile-time parity test that every declared channel is registered exactly once and exposed only when intended.
- Add Electron E2E coverage that creates an iframe/unexpected frame and proves a privileged mutation is rejected without changing the isolated archive.
- Snapshot only stable error codes and safe messages; assert errors contain no API keys, URLs with share tokens, paths outside the selected root, or imported bodies.

Exit gate: no raw channel strings outside contract/registration tests, all privileged handlers use the wrapper, and malformed/unexpected-sender calls produce zero side effects.

### P0-D. Atomic persistence, failed-load quarantine, and archive paths

Target structure:

```text
electron/services/persistence/
  atomicFile.ts
  loadState.ts
  schemas.ts
  archivePaths.ts
  qaIndex.ts
```

#### Atomic-file primitive

Implement one synchronous primitive consistent with the current synchronous services:

1. Resolve and validate the final absolute target under its approved root.
2. Create a uniquely named sibling temporary file with exclusive creation.
3. Write the complete bytes, flush the file handle, and close it.
4. Validate/read back JSON or envelope output where applicable.
5. Promote by same-directory replace/rename. Preserve the previous target as a last-known-good sibling for small control files until the new target validates.
6. Flush the containing directory where the platform supports it.
7. Clean only this operation's temporary file on failure; never delete or truncate the valid target first.
8. Return an operation ID and structured outcome. Log path category and byte count, not content.

Abstract filesystem operations behind a narrow injectable `FileOps` interface so tests can fail each step deterministically. Validate the exact Windows replacement behavior under the upgraded Electron/Node runtime; do not assume POSIX rename semantics.

Migrate writers in small PRs: settings, threads, tag dictionary, embedding store, model catalog cache, secrets envelope, QA create/update, and user-selected exports. Creation must use exclusive semantics; updates must preserve the original on failed promotion.

#### Load-state policy

1. Introduce `LoadState<T> = missing | loaded | corrupt | unreadable | unsupported-version` with diagnostics and optional last-known-good recovery.
2. `missing` may initialize defaults. All other failure states set a service write barrier.
3. `save*` checks the barrier and returns `load-corrupt`/`needs-repair` until an explicit repair, successful reload, or user-confirmed replacement.
4. Add runtime schemas and `schemaVersion` to settings, threads, tags, embeddings, model cache, and secrets envelope.
5. Make `threadService.loadThreads()` catch and return a structured state instead of allowing the renderer to continue with an empty writable map.
6. `listAllPairs()` must return pairs plus health diagnostics: skipped file paths/reasons and every duplicate-ID pair. Do not let later duplicates silently overwrite earlier ones.
7. Build an archive-scoped id-to-path map on the successful scan. `getPair`, update, delete, duplicate cleanup, and import allocation use it. Invalidate/update it only after successful file commits.

#### `ArchivePaths` authority

1. Replace direct path construction with an immutable snapshot containing canonical data root, archive directory, threads/tags paths, archive namespace, and userData-only paths.
2. Normalize the “user selected `archive/` itself” case once. Remove the current split between `getDataDir()` and raw `getDataDirectory()` consumers.
3. Capture a snapshot at operation start. A settings change cannot redirect an in-flight import/write midway.
4. Namespace derived indexes using a SHA-256 of the canonical archive path or a persisted archive UUID. The safer first migration is a path-derived namespace: moving an archive causes regeneration rather than accidental reuse.

Regression coding:

- `tests/unit/atomicFile.test.ts`: fail open/write/flush/close/replace/readback; assert the old target is byte-identical, temp files are bounded/cleaned, and a valid last-known-good can be recovered.
- Run the same atomic tests on Windows in CI or the release VM, including antivirus-style `EPERM`/sharing violations.
- `tests/unit/loadState.test.ts`: missing initializes; malformed JSON, wrong schema, unreadable file, and invalid fields block save; explicit repair clears the barrier.
- `tests/unit/threadPersistence.test.ts`, `settingsPersistence.test.ts`, `tagPersistence.test.ts`, and `qaPersistence.test.ts`: round trip, old-version migration, double migration, injected failure, and no overwrite after failed load.
- `tests/unit/archivePaths.test.ts`: root vs selected `archive` folder, relative/`..`, case normalization on Windows, UNC/symlink/junction containment where supported, and immutable operation snapshot.
- `tests/unit/qaIndex.test.ts`: duplicate IDs, corrupt Markdown, create/update/delete index maintenance, and O(n) scan followed by O(1) lookup. Add a performance characterization with thousands of tiny files without brittle millisecond claims.
- Extend archive health tests to assert skipped paths and duplicate-ID pairs are visible and no content is overwritten.

Exit gate: every persistent writer uses the atomic primitive or has a documented reason; corruption and write failures are recoverable; all path consumers use `ArchivePaths`.

### P0-E. Shared-link transport and Gemini containment

Implementation steps:

1. Add a pure URL policy that requires HTTPS, no credentials, default port, exact registered host, and provider-specific path shape. Redact the final path token in all logs.
2. Replace automatic redirect following in `fetchJson()` with manual handling. Enforce three hops, 20 seconds total wall time, and a conservative decoded response ceiling (start at 16 MiB for share JSON and adjust only from real sanitized fixtures).
3. Validate every redirect target before following it. Keep per-provider API host allowlists; reject scheme downgrade, credentials, non-default ports, unknown hosts, loops, and missing/invalid `Location`.
4. Abort the request and stop accumulating chunks immediately when the byte ceiling is crossed. Parse JSON only after a 2xx response within budget.
5. Return structured transport/import errors: `invalid-url`, `redirect-disallowed`, `redirect-limit`, `timeout`, `response-too-large`, `private-or-expired`, and `format-changed`.
6. Create each Gemini renderer with a unique non-persistent partition (a partition without `persist:`), sandbox/context isolation, no preload, disabled Node integration, popup denial, permission request/check denial, and a main-frame navigation/redirect allowlist.
7. Validate the final Gemini origin before executing the extraction script. Destroy the window on success, timeout, navigation failure, policy rejection, renderer crash, and caller cancellation.
8. Keep the primary-window lockdown from 1.4 and test it separately from the hidden-window policy.

Regression coding:

- `tests/unit/remoteUrlPolicy.test.ts`: valid provider endpoints and every rejected URL shape, including Unicode/punycode confusion and redaction.
- `tests/unit/fetchJsonPolicy.test.ts` with a fake Electron net layer: 2xx JSON, malformed JSON, timeout, exact byte boundary, chunked overrun, redirect loop, hop 4, downgrade, hostile host, missing location, and request abort cleanup.
- `tests/unit/geminiWindowPolicy.test.ts`: unique in-memory partition, no preload, popup/permission denial, allowed final route, denied off-origin redirect, destruction on every terminal path.
- Extend shared-link fixtures to confirm existing Claude/ChatGPT/Copilot/Gemini imports still parse identically and raw share IDs never appear in captured logs/errors.
- Add one opt-in/manual live-provider smoke per provider; it must use public disposable links and must never be a required deterministic CI test.

Exit gate: no remote import path has unbounded redirects/time/body, and the hidden window cannot persist state or leave the approved origin.

### P0-F. Bulk-import limits, durability, performance, and cancellation

#### Preview contract and budgets

Add centralized named limits with structured `limit-exceeded` details. Initial ceilings should be conservative and based on sanitized real exports: 256 shards, 64 MiB per decoded entry, 128 MiB aggregate decoded text, 10,000 conversations, 50,000 pairs, and 2 MiB per message body. Count decoded UTF-8 bytes, not JavaScript string length. Treat these as security policy constants with tests; changes require review and a real fixture rationale.

1. Build a shard manifest before parsing. Extract numeric indices, sort numerically, reject duplicate indices, and report gaps/unreadable/invalid shards explicitly. Do not return a successful-looking partial preview.
2. Use `crypto.randomUUID()` for both preview IDs and a new internal `previewThreadId` on every visible row. Selection uses `previewThreadId`; provider `sourceId` remains provenance/dedup data and may be empty/duplicated.
3. Store `{preview, ownerWebContentsId, createdAt, expiresAt, state, abortController}`. Use a 10-minute TTL, an unref'd cleanup timer, and cleanup on owner destruction.
4. Only the owner can summarize, commit, cancel, or release its preview. Commit changes state atomically from `ready` to `committing`; repeat commit is rejected.

#### Commit loop

1. Make `commitArchiveImport()` asynchronous and accept an `AbortSignal`.
2. At start, load the QA id/path index and occupied filenames once. Pass a commit-local ID allocator into pair creation; never call `readdirSync` inside a collision loop.
3. Process one conversation as the durable unit. Write its selected pairs atomically, update the live origin index, add the thread, then atomically save `threads.json` before declaring that conversation complete.
4. Check cancellation before each pair and before thread promotion. Yield with `setImmediate` after a bounded number of pairs or approximately one frame budget, whichever comes first.
5. Make the existing cancel channel abort a committing preview instead of merely deleting the map entry. Do not release bodies until the loop unwinds.
6. Return `{cancelled, completedThreads, createdPairs, skippedDuplicates, failed, warnings}`. Progress distinguishes processed, durably committed, skipped, failed, and cancelling.
7. Preserve D1 recovery: a crash between pair write and thread save may leave orphan pairs, but a re-run must find their `origin_id` and thread them without duplication.
8. Save/import tags through the atomic tag service. Tag update failure is reported separately and must not falsify pair/thread commit status.

Regression coding:

- Extend `tests/unit/archiveReader.test.ts` with numeric order (`2` before `10`), duplicate/gapped shards, unreadable shard, aggregate bytes, shard count, and exact-limit cases for ZIP, folder, and bare-shard inputs.
- Extend `tests/unit/bulkImport.test.ts` with empty and duplicate provider IDs selected independently through `previewThreadId`.
- Add failure injection after each pair write and before/after each thread save; restart/re-run and assert no duplicate pair plus correct thread recovery.
- Add cancellation tests before work, mid-pair sequence, between pair and thread save, and after final commit. Assert completed units remain valid, incomplete work is recoverable, and preview memory is released.
- Add owner/TTL tests with fake clock and webContents IDs; assert a second window cannot commit/cancel another preview.
- Add a responsiveness test using an injected scheduler: assert yields occur within the configured chunk even for thousands of pairs. Keep absolute performance/soak measurement manual.
- Add E2E `bulk-import-cancel.spec.ts` with a generated bounded fixture, visible progress, cancel, archive reload, and safe re-import.

Exit gate: bounded deterministic preview, no main-process freeze in the soak fixture, real cancellation, and successful crash/re-run recovery.

### P0-G. Secret-storage hardening and legacy migration

Implementation steps:

1. Extend the injected `SafeStorageCrypto` interface with `getSelectedStorageBackend()` where supported.
2. On Linux, treat `basic_text` as unavailable/insecure. Do not label it encrypted storage and do not silently save keys through it. Return a stable status/warning code.
3. Move the encrypted envelope to the atomic-file primitive and validate the new envelope by decrypting it before promotion/cleanup.
4. Replace rename-only legacy cleanup with a migration routine:
   - locate `secrets.json` and known `.orphaned.bak` files;
   - parse only known string keys with strict size limits;
   - merge without overwriting a valid newer stored value unless the user explicitly chooses replacement;
   - encrypt and atomically persist;
   - reload/decrypt and compare keyed fingerprints in memory;
   - only then unlink the plaintext file;
   - report that filesystem deletion is best-effort and cannot guarantee physical erasure on SSD/cloud-sync history.
5. If secure storage is unavailable or any verification fails, leave plaintext untouched, warn clearly, and provide retry/purge controls. Never log values or plaintext file contents.
6. Add `azureOpenAiApiKey` only when the Azure adapter lands; keep the renderer status projection generic over known secret IDs.

Regression coding:

- Extend `tests/unit/safeStorageSecretsBackend.test.ts` for DPAPI/Keychain-like backend names, Linux `basic_text`, backend-probe exceptions, atomic promotion failure, corrupt old/new envelopes, and verified round trip.
- Add `tests/unit/legacySecretsMigration.test.ts`: no file, valid migration, merge precedence, multiple backups, malformed/oversized file, unavailable backend, write failure, verification mismatch, purge failure, and idempotent second run.
- Install a log sink in tests and assert known secret values never appear in diagnostics, status, IPC errors, or renderer projections.
- Manual Linux test: secure keyring available vs unavailable/`basic_text`. Manual Windows test: install, save, restart, upgrade, and read status without re-entering the key.

Exit gate: Linux insecurity is honest, envelope writes are recoverable, and no plaintext is deleted before verified encrypted persistence.

### P0-H. Settings as one validated draft

Target structure:

```text
src/composables/useSettingsDraft.ts
shared/contracts/settings.ts
electron/services/settingsDraftService.ts
tests/renderer/useSettingsDraft.test.ts
tests/unit/settingsDraftService.test.ts
```

Implementation steps:

1. Model `original`, `draft`, `dirtyFields`, `validation`, `catalogRequest`, and `phase` (`loading`, `editing`, `validating`, `applying`, `error`, `done`) in `useSettingsDraft`.
2. Add main commands:
   - `settings:validateDataDirectory(path)` probes containment/read/write with a temporary sibling and returns an archive summary without activating it.
   - `ai:testConnection({providerId, modelId, apiKeyOverride, providerConfig})` tests exactly the visible draft and never persists the override.
   - `settings:applyDraft({settings, secretUpdates, expectedRevision})` validates and applies the complete draft.
3. Validate provider enabled state, declared capability, model ownership, tag limits, paths, secret-field ownership, and a settings revision before writes.
4. Commit secrets and settings through atomic writers with compensating backups. If any required step fails, restore the prior durable state; if restoration fails, return `needs-repair` and block further saves.
5. Activate/reload a new archive only after validation and successful settings commit. On reload failure, restore the prior setting and archive projection.
6. In catalog loading, capture provider ID and monotonically increasing request ID before `await`; apply only the newest matching result. Disable Save while the selected provider has an unresolved catalog or invalid model.
7. Cancel closes without IPC writes. Connection testing leaves key drafts in the form until Apply.
8. Split Settings tabs into components only after the composable owns the state; components receive typed draft slices and emit typed changes.

Regression coding:

- Add jsdom and `@vue/test-utils`, and configure separate Vitest projects/patterns for `tests/unit` (Node) and `tests/renderer` (jsdom). Keep Electron main tests in Node.
- `useSettingsDraft.test.ts`: initial load, dirty tracking, Cancel no writes, validation routing to tab, save disable during catalog load, slow old provider response discarded, typed key retained after test, apply success, apply failure, and double-submit prevention.
- `settingsDraftService.test.ts`: stale revision, unknown provider, model/provider mismatch, invalid tags/path, directory probe cleanup, secret failure, settings failure with rollback, reload failure with rollback, and rollback failure entering `needs-repair`.
- Extend `settings-dialog.spec.ts`: change provider/model/key without saving, test the visible configuration, cancel and reopen to prove no persistence; save and restart to prove coherent persistence; invalid/unreadable archive directory leaves the old archive active.

Exit gate: Cancel is honest, Test Connection is side-effect-free and draft-accurate, and Apply is coherent or explicitly repair-required.

### P0-I. LLM capability contracts and Anthropic SDK

Implementation steps:

1. Replace `LLMProvider` with minimal interfaces: `CompletionProvider`, `EmbeddingProvider`, and optional `StreamingCompletionProvider`.
2. Add `capabilities: {complete, embed, streaming, local}` and owned models/config schema to each registry descriptor. Capabilities are immutable data returned to UI and checked again by factories.
3. Add `getCompletionProvider(config)` and `getEmbeddingProvider(config)`. Code that requests embeddings cannot receive Anthropic and then discover incompatibility through `embed()` throwing.
4. Validate selected provider/model/capability in provider construction and every IPC operation. Remove provider-name checks from Settings, embedding commands, and help text.
5. Replace the hand-written Anthropic client/model fetch with `@anthropic-ai/sdk`. Configure explicit timeout/retry policy, handle all text blocks, detect truncation/`stop_reason`, and capture provider usage without logging response bodies.
6. Centralize safe provider error mapping/redaction. Preserve the original error only in main diagnostics when it contains no secret/request content.
7. Reconcile model-catalog and runtime adapter ownership so the same registry defines model discovery, capability, and configuration rules.

Regression coding:

- `tests/unit/providerRegistry.test.ts`: unique IDs, valid capability combinations, model ownership, secret/config requirements, and no enabled descriptor without a factory.
- `tests/unit/providerFactory.test.ts`: completion/embed success paths, capability rejection before network, unknown/disabled provider, wrong model, and safe error codes.
- `tests/unit/anthropicProvider.test.ts`: SDK request shape, timeout, retryable vs permanent errors, multiple text blocks, empty output, truncation, stop reason, usage accounting, and secret redaction.
- Update embedding/metadata/insights/annotation tests to inject the minimal capability interface they actually need.

Exit gate: no universal provider interface, no Anthropic runtime `embed()` trap, and capability-based UI/main behavior agrees.

### P0-J. Coordinator extraction and documentation reconciliation

Implementation steps:

1. Extract `useCommandRegistry` from `App.vue`; keep command IDs/accelerator hints canonical and testable.
2. Extract `useImportCoordinator`; it owns file/shared/bulk state, progress listener lifecycle, cancel, reload, and safe toast projection.
3. Replace all `llm:*` DOM events with typed store actions, composable methods, or explicit component emits/exposed methods. Do not introduce a second string event bus.
4. Keep `App.vue` responsible for composition/layout/top-level error capture only.
5. Reconcile README, in-app help, command/menu labels, `noEmbeddingsMessage()`, provider capability text, and build notes after behavior settles. Add “superseded/implemented by” banners to dated plans rather than rewriting historical findings.

Regression coding:

- `tests/renderer/useCommandRegistry.test.ts`: unique IDs, menu/palette dispatch parity, feature-gated visibility, disabled reasons, and shortcut metadata.
- `tests/renderer/useImportCoordinator.test.ts`: listener subscribe/unsubscribe, single active import, cancel, error projection, reload after commit, and no stale progress after close.
- Keep/extend `accelerators.test.ts` to prove every user-triggered Phase 0 action is reachable through the command registry and native menu where appropriate.

Exit gate: zero `llm:*` DOM event occurrences and no behavior drift in command/import E2E scenarios.

## 7. Phase 0.1 — multi-provider LLM abstraction

Phase 0.1 begins only after P0-I. It implements adapters and tests; Phase 2.5 remains responsible for normal user-facing provider selection.

### Ollama adapter

1. Add a completion + embedding adapter using the local Ollama HTTP API.
2. Default to `http://127.0.0.1:11434`; accept only loopback addresses in Phase 0. Do not allow arbitrary LAN/public endpoints, credentials, or redirect following.
3. Discover models with bounded timeout/body and classify completion/embed support from model metadata or a conservative capability probe.
4. Mark `{local: true}` and cost zero/unknown; still meter calls/tokens where available.
5. Map connection refusal, missing model, timeout, malformed JSON, and cancellation to stable codes.

### Azure OpenAI adapter

1. Define strict config `{endpoint, deployment, apiVersion}` plus `azureOpenAiApiKey` in main-side secret storage.
2. Require HTTPS and an approved Azure OpenAI hostname policy; normalize endpoint once and prohibit userinfo, fragments, arbitrary paths, and redirects.
3. Use the official OpenAI SDK's Azure support if compatible with the pinned SDK; do not fork request/usage parsing unnecessarily.
4. Treat deployment ownership/capability as configuration validated before calls. Keep Phase 0 UI exposure behind a disabled/internal flag until Phase 2.5.

Regression coding:

- Contract-test all adapters through one suite: complete, embed when declared, timeout, abort, malformed output, auth failure, rate limit, usage extraction, and redaction.
- Add Ollama-specific SSRF tests for non-loopback IPv4/IPv6, DNS names, redirect attempts, and port/path normalization.
- Add Azure URL/deployment/API-version validation tests and SDK request-shape tests with no live credentials.
- Provide opt-in integration scripts using environment variables; never run live paid-provider tests in CI.

Exit gate: adapter contract suites pass, unsafe endpoints are rejected before network, and adapters are not accidentally surfaced as stable UI options.

## 8. Phase 0.2 — generic batch-LLM job runner

Target structure:

```text
electron/services/llm/batchRunner.ts
electron/services/llm/batchJobRegistry.ts
src/components/BatchReviewDialog.vue
src/composables/useBatchReview.ts
shared/contracts/batch.ts
```

Implementation steps:

1. Define a generic job specification: job type, target IDs, snapshot/content hash, batch size, capability, prompt builder, strict output schema, proposal mapper, and apply function.
2. Jobs receive opaque UUIDs and owner `webContents`; registry entries have TTL, abort controller, phase, counters, and safe diagnostics.
3. Enforce one active cost-bearing job per owner initially. Queueing/concurrency can be added later from evidence.
4. Before dispatch, estimate target count/tokens/cost through 0.7 and require confirmation above the warning threshold.
5. For each batch: check abort, call a capability-specific metered provider, strip only known fence wrappers, parse with zod, reject duplicate/unknown IDs, and record per-item errors without trusting model text.
6. Emit typed progress. Generation writes nothing.
7. Proposals include the source content hash/version. Apply accepts only approved proposal IDs and rechecks that each target is unchanged; stale entries are skipped with `stale-target`.
8. Make application a separate validated command with atomic writes. Partial application is reported per item.
9. Refactor confidence annotation onto the runner as the proof consumer before Phase 2 title/tag/compression work.
10. Build a generic review shell with keyboard navigation, confirm/override/skip, select-all where safe, cost/usage summary, and cancel.

Regression coding:

- `tests/unit/batchRunner.test.ts`: chunking, zero targets, progress, cancellation before/during/between batches, provider failure, malformed JSON, duplicate/unknown IDs, invalid enums, partial success, owner/TTL cleanup, and metering exactly once.
- `tests/unit/batchApply.test.ts`: no writes during generation, approved-only apply, stale content hash, vanished target, injected write failure, and accurate partial result.
- `tests/renderer/useBatchReview.test.ts`: phase state machine, keyboard flow, overrides, cancel, retry, stale result rendering, and listener cleanup.
- Preserve annotation behavior through old-vs-new characterization fixtures and one E2E annotation review/apply scenario with a fake provider.

Exit gate: annotation uses the generic path, generation is read-only/cancellable/metered, and apply rejects stale or unapproved output.

## 9. Phase 0.3 — shared multi-selection model

Implementation steps:

1. Add `useSelectionModel<TId>()` with `selectedIds`, `primaryId`, `anchorId`, and a supplied ordered list of currently visible IDs.
2. Semantics: plain click selects one and sets primary/anchor; Ctrl/Cmd-click toggles; Shift-click selects the contiguous visible range from anchor; checkboxes toggle without losing primary; “select all” affects only visible/filter-matching rows.
3. Prune IDs removed by reload/filter/archive switch. Clear all selection on archive switch; retain hidden selections only if an explicit future bulk workflow requires it. Phase 0 defaults to visible-only for predictability.
4. Integrate with QA and thread lists while preserving `selectedPairId`/`selectedThreadId` as the active detail item. Existing single-item commands continue to act only on `primaryId`; Phase 3 will opt commands into multi-target behavior.
5. Add checkbox mode and clear/selected-count affordances without adding bulk operations.
6. Define keyboard focus separately from selection so arrow navigation does not accidentally mutate a bulk set.

Regression coding:

- `tests/renderer/useSelectionModel.test.ts`: every click modifier, forward/backward range, changed ordering, filtered list, item deletion, select all, disabled row, archive reset, and primary/anchor rules.
- Component tests for QA and Threads prove independent selection state and legacy single-click detail behavior.
- E2E test Ctrl/Cmd and Shift semantics with platform-aware modifiers and verify Delete still affects only the primary item in Phase 0.

Exit gate: both lists use one tested model, selection never leaks across archives/lists, and no existing command becomes implicitly bulk-destructive.

## 10. Phase 0.4 — command and undo/redo infrastructure

Use `UndoableMutation` terminology to avoid confusion with the UI command registry.

Implementation steps:

1. Add an async serialized command manager with `invoke`, `undo`, `redo`, `canUndo`, `canRedo`, a bounded history (start at 100 committed entries), and operation IDs.
2. Push history only after durable success; clear redo on a new command. Block re-entrancy while a command/compensation is in flight.
3. Each mutation records minimal before/after state plus archive namespace and expected entity version/hash. Never store secrets or large unrelated archive snapshots.
4. Wrap edit, tag change, move, and thread mutation first. Add delete only after deletion is recoverable: move the QA file to an archive-local trash/quarantine area or return a main-generated tombstone token that can restore the exact ID/file and thread membership.
5. Undo/redo revalidate archive namespace and expected current version. External/manual edits produce `history-stale`; clear or quarantine later history and require reload.
6. On compensation failure, mark the manager `tainted`, disable further undo/redo and mutation dispatch through it, and prompt reload/repair. Never pretend state rolled back.
7. Clear history on archive switch, archive reset, bulk import, load corruption, or full reload. Phase 0 history is session-only; durable version history remains Phase 3.
8. Register Ctrl/Cmd+Z and Ctrl/Cmd+Y through the canonical accelerator/command path; input fields retain native text undo unless the app-level mutation context is active.

Regression coding:

- `tests/unit/undoManager.test.ts`: successful invoke, failed invoke absent from history, undo/redo, redo invalidation, limit eviction, serialization, re-entrancy, stale version, archive mismatch, compensation failure/taint, and clear conditions.
- Mutation-specific round trips: edit, tags, move/order, thread membership, delete/restore exact ID/path/frontmatter/version, and redo delete.
- Failure injection at durable write boundaries proves renderer and disk projections agree after failure.
- E2E covers edit → undo → redo, delete → undo, shortcut behavior inside/outside inputs, toast/action state, restart clearing session history, and archive switch clearing history.

Exit gate: every listed mutation has a successful round-trip and injected-failure test, with recoverable delete and no cross-archive history.

## 11. Phase 0.5 — shared query/filter engine

Implementation steps:

1. Define a serializable query AST for source set, inclusive UTC date range, tag set with explicit `all`/`any`, URL presence, and normalized full text.
2. Validate query size/count/range with zod. Compile once into a predicate over a read-only QA projection.
3. Use Unicode normalization plus locale-independent case folding. Do not compile user strings into regular expressions.
4. Specify missing/invalid timestamp behavior, empty-filter identity, tag normalization, and deterministic stable ordering.
5. Keep persistence of saved filters/virtual threads out of Phase 0; expose pure parse/compile/evaluate functions for Phase 3.
6. Optionally route current compatible full-text/tag search through the engine only after characterization tests prove unchanged results.

Regression coding:

- `tests/unit/queryEngine.test.ts`: each predicate, all combinations, AND/OR tag semantics, boundaries, invalid/missing dates, URL empty/whitespace, Unicode/case, punctuation, empty query, oversized input, and deterministic output.
- Property tests or generated cases compare compiled predicates with a simple reference evaluator.
- ReDoS/performance test uses long literal input and proves no regex path; large-archive soak remains manual.
- Existing search E2E must remain green if current search is migrated.

Exit gate: query semantics are documented, pure, bounded, deterministic, and reusable without UI/store globals.

## 12. Phase 0.6 — experimental-feature surface

Implementation steps:

1. Add a versioned `experimentalFeatures` object to settings with stable IDs and explicit booleans. Missing or unknown flags resolve false.
2. Add Settings → Experimental Features with risk/cost/local-data descriptions and “restart required” only where technically necessary.
3. Centralize `isFeatureEnabled(id)` in renderer and main. Main rejects disabled IPC operations even if the renderer is bypassed.
4. Gate unfinished batch consumers, Ollama/Azure exposure, future MCP, and other cost/instability surfaces. Do not silently fold `lensEnabled` into a new flag without a migration and behavior decision.
5. Log only flag ID and transition. Never fetch remote flag configuration in Phase 0.
6. Unknown flags from a newer settings file are preserved for forward compatibility but cannot enable behavior in an older app.

Regression coding:

- `tests/unit/featureFlags.test.ts`: defaults false, known enable/disable, unknown preservation-but-disabled, malformed values, schema migration, main-side enforcement, and archive/settings reload.
- Renderer tests prove hidden/disabled commands and explanatory copy; direct mocked IPC call still receives `feature-disabled`.
- E2E enables a harmless test flag, restarts, verifies persistence, disables it, and confirms the guarded action is unavailable.

Exit gate: every experimental/cost-bearing Phase 0 surface has a stable flag and duplicate main enforcement; defaults cause no new calls or behavior.

## 13. Phase 0.7 — LLM usage guardrails

Implementation steps:

1. Replace the global token counters with a session `UsageLedger` keyed by operation/job, provider, model, capability, and local/remote classification.
2. Record call count, requested/completed/cancelled/failed state, input/output/embed tokens when reported, estimate quality, and approximate cost. Do not record prompt/response text, QA IDs, URLs, or secret material.
3. Put metering around provider factories/adapters so every completion/embedding call uses the same guard. Remove direct counter calls from individual features.
4. Store model price metadata with source/effective date. If pricing is unknown or stale, display tokens/calls and “cost unavailable”; never invent a precise price.
5. Before batch fan-out, show estimated calls/tokens/cost and require confirmation above a warning threshold. Add a per-session hard limit with an explicit one-time user override; local providers count calls but default to zero monetary estimate.
6. Surface concise session usage in Application Status and job completion toasts. Reset on application restart and via the existing reset action.
7. Feature flags and usage guard checks happen before creating network requests.

Regression coding:

- `tests/unit/usageLedger.test.ts`: success/failure/cancel, retries without double counting, completion vs embedding, local provider, missing usage, stale/unknown pricing, reset, threshold warning, hard stop/override, and concurrent jobs.
- Adapter contract tests assert one ledger record per physical request and redacted metadata.
- Renderer tests verify estimate/confirmation/status copy and no secrets/prompts in the displayed or serialized ledger.
- E2E with a fake provider proves a disabled feature makes zero calls, warning cancel makes zero calls, confirmation records usage, and reset clears only session accounting.

Exit gate: all call sites are metered, cost uncertainty is explicit, and opt-out/cancel prevents network activity.

## 14. Regression-test implementation program

### 14.1 Harness preparation

Implement these before the corresponding production refactors:

1. Split Vitest into Node and jsdom projects while keeping `npm test` as the single aggregate command.
2. Add `tests/renderer/setup.ts` with clean Pinia, DOM, timers, localStorage, and a typed fake `window.api` reset before each test.
3. Add `tests/unit/helpers/fileOps.ts` for deterministic filesystem failure injection, `fakeClock.ts`, `fakeScheduler.ts`, `fakeWebContents.ts`, `fakeNet.ts`, and `logCapture.ts`.
4. Add sanitized fixtures for every persisted schema version, corrupt/truncated variants, duplicate QA IDs, slow/oversized remote bodies, shard manifests, and provider responses.
5. Add invariant tags (`INV-IPC`, etc.) to test descriptions or a coverage matrix so reviewers can trace every safety claim to a test.
6. Keep live API tests opt-in and credential-free by default. No fixture may contain a real share token, API key, personal archive content, or machine-specific absolute path.
7. Make test temp roots exact and isolated. Reuse the existing E2E `userData` and archive isolation checks; assert equality/containment before every destructive fixture cleanup.

### 14.2 Required automated suites

| Suite | Runs by default | Purpose |
|---|---:|---|
| Typecheck + non-mutating lint | Yes | Contract/parity and code-quality gate. |
| Node unit | Yes | Schemas, persistence, imports, providers, migrations, query/undo core. |
| jsdom renderer unit | Yes | Settings, selection, command/import/batch composables, feature/cost UI state. |
| Production Vite build | Yes | Renderer/main/preload bundle compatibility. |
| Production dependency audit | Yes in clean CI | No untriaged high/critical production advisory. |
| Electron smoke/security E2E | Required per Phase 0 PR when relevant | Real preload, sender/navigation, persistence, settings, cancel, undo behavior. |
| Full Electron E2E | User pre-push/merge gate | Cross-feature workflow regression. |
| Visual snapshots | User pre-push only when affected | Layout/theme regression; update snapshots only for intentional reviewed changes. |
| Windows NSIS/MSI lifecycle | Electron/persistence/release PR gates | Installed runtime, upgrade/uninstall, data preservation. |

### 14.3 Cross-cutting destructive/failure matrix

Every persistence-affecting feature must test the following operation points where applicable:

| Failure point | Required assertion |
|---|---|
| Before validation | No file/network/state change. |
| Temp create/write/flush/close | Old target byte-identical; bounded temp cleanup. |
| Promote/replace | Old target or last-known-good recoverable; write barrier on ambiguity. |
| After data file, before control file | Re-run detects idempotency key and repairs linkage without duplication. |
| Corrupt load followed by user mutation | Save rejected; corrupt source retained. |
| Cancellation before durable unit | No new durable state. |
| Cancellation after durable unit | Completed unit valid and reported; next unit absent/recoverable. |
| Renderer reload/crash | Main-owned jobs/previews cleaned by owner/TTL; committed data reloads. |
| Archive switch mid-operation | Operation uses captured old snapshot or is cancelled; never writes to the new archive. |
| Stale async response | Result discarded; current provider/model/settings remain unchanged. |
| Malicious error/remote/model text | Stable safe error shown; no HTML execution, secret/token/body leakage, or path escape. |

### 14.4 Manual regression and soak pass

Run after all Phase 0 PRs merge to a stabilization candidate. Use copied/sanitized archives, never the only production archive.

1. Windows clean install, upgrade from 1.4.1, launch, restart, uninstall/reinstall, and MSI lifecycle validation.
2. Archive on local NTFS, OneDrive-synced Documents, read-only directory, temporarily unavailable directory, and a path where the user selected `archive/` itself.
3. Open an intentionally corrupt settings/thread/tag/embedding/QA copy; confirm visible repair-required state and no overwrite after attempted edits.
4. Create/edit/tag/move/delete/undo/redo QAs and threads; restart and confirm durable state plus session-history reset.
5. Import real sanitized Claude, ChatGPT sharded, Gemini JSON/HTML, and Copilot exports. Measure preview time, peak memory, commit throughput, UI responsiveness, cancellation latency, restart/re-run recovery, and final health report.
6. Test supported direct shared links, private/expired links, redirects, offline mode, slow connection, and remote failure. Confirm no hidden window/cookie/session remains.
7. Save/test OpenAI and Anthropic settings; simulate invalid key, timeout, rate limit, secure-storage failure, and catalog race. On Linux, verify `basic_text` is not called secure.
8. Exercise Ollama on loopback and reject LAN/public endpoints. Exercise Azure only with a disposable test deployment and explicit cost approval.
9. Run confidence annotation through the generic runner with cancel, malformed response, stale target, selective approval, and usage display.
10. Run the full E2E suite and affected visual suites explicitly. Review every new snapshot rather than bulk-accepting.

Record archive size, OS, filesystem/sync mode, Electron version, durations, memory high-water mark, failures, and recovery result. Minimum soak: two normal work sessions plus one forced termination during a copied-archive bulk import.

## 15. Merge gates and Phase 1 readiness

Each Phase 0 PR must include:

- Narrow scope and named invariants affected.
- Tests added before/with implementation, including at least one negative/failure case.
- `npm run build` after edits and the relevant `npm run check`/focused tests.
- Manual reproduction notes for user-visible workflow changes.
- Updated `doc/dev_process/build-notes.md` for behavior/workflow changes, plus README/in-app help/affected plan docs when user-visible behavior changes.
- Confirmation that pre-existing/unrelated files were not modified.

Final Phase 0 acceptance checklist:

- [ ] Clean install and CI gate are green; parser budget regression is resolved by evidence, not threshold inflation.
- [ ] Electron is supported and Windows packages pass launch/upgrade/lifecycle tests.
- [ ] Every privileged IPC channel has sender/frame and zod validation.
- [ ] Every persistent writer is atomic/recoverable; failed loads block overwrite.
- [ ] Archive health reports corrupt/skipped QA files and duplicate IDs.
- [ ] One `ArchivePaths` authority scopes tags, indexes, jobs, selection, and history.
- [ ] Embeddings carry archive/provider/model/dimension identity; mismatches are rejected and stale entries are garbage-collected.
- [ ] Remote import enforces URL/redirect/time/body policy and Gemini uses a non-persistent contained session.
- [ ] Bulk preview and commit enforce budgets, unique row identity, owner/TTL, deterministic shards, yielding, incremental saves, and cancellation.
- [ ] Secret backend reporting is honest; envelope writes and legacy migration are verified and recoverable.
- [ ] Settings Test/Cancel/Apply semantics are coherent under races and injected failures.
- [ ] Completion/embedding capabilities are explicit; Anthropic SDK, Ollama, and Azure adapters pass contract/security tests.
- [ ] Confidence annotation runs through the generic batch runner with read-only generation, approval, staleness checks, cancellation, and metering.
- [ ] QA/thread lists share the selection model without making existing destructive actions bulk by accident.
- [ ] Edit/tag/move/delete undo/redo passes normal, stale, cross-archive, and failure-injection tests.
- [ ] Query engine is pure, bounded, deterministic, and documented.
- [ ] Experimental/cost features default off and are enforced in main.
- [ ] Every LLM/embed call is metered and redacted; estimates distinguish known, approximate, and unavailable cost.
- [ ] Full user-run Electron E2E, affected visual suites, Windows packaging, and manual soak pass are complete.
- [ ] README, in-app help, menus, build notes, and provider capability messages agree.

Phase 1 may proceed independently in source-control terms, as the master roadmap permits, but it should merge into a v2 release line only while the Phase 0 acceptance gate remains green. A red persistence, IPC, security, or clean-install gate blocks Phase 1 release even if the Phase 1 feature itself is unrelated.
