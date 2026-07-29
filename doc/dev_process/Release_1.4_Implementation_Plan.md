# Release 1.4 — Scope and Deferral Plan

**Date:** 2026-07-28
**Author:** Claude Opus 5, at the request of Vlad Sadovsky
**Responds to:** `doc/dev_process/Release_Architecture_and_Stability_Review_2026-07-27.md`
**Baseline:** `1.3.2`, branch `vlads-dev`
**Status:** Approved for implementation

---

## Context

The 2026-07-27 architecture review blocked the release on three P0s and fourteen P1/P2 findings.
Every finding was independently verified against the code before this plan was written. **None came
back false.** Several are more severe than described, and seven additional defects surfaced during
verification (recorded in Part 4).

1.x is a released line in customers' hands. That makes "fix everything now" the *risky* option, not
the safe one: the review's full remedy set includes a ten-major Electron upgrade, a build-tool major,
a runtime-validation layer, and a persistence-ownership migration — changes whose failure mode is
"the app that worked yesterday is broken today for someone who paid for it."

**The governing principle of this plan: 1.4 takes only changes that are additive guards or
single-expression fixes — work with near-zero regression surface. Everything requiring a soak goes to
V2 Phase 0.**

This is not a deferral of the security work wholesale. It is a deliberate ordering based on which
fixes *remove attack paths* versus which ones *harden paths that will already be closed*. The
rationale is in Part 1.

---

## Part 1 — Risk assessment behind the split

### What caps the security severity

Three findings verified during review materially limit the blast radius, and they are why this split
is defensible rather than reckless:

- **No RCE.** `sandbox` defaults to on in Electron 33, with `nodeIntegration: false` and
  `contextIsolation: true`. A hostile page reaches the IPC surface and nothing else — no Node, no
  shell.
- **No key theft.** `secrets:load` returns only presence, provenance, and masked previews
  (`handlers.ts:210-214`), and there is **no configurable provider base URL anywhere in
  `electron/services/llm/`** — so there is no path to redirect an authenticated call to an attacker
  host. API keys cannot be exfiltrated through any known chain.
- **The path traversal is not code execution.** `createPair`'s filename is always
  `<id>_00_<source>_<words>.md`. An attacker controls the directory but the extension is forced to
  `.md` and the tail is sanitized. It is arbitrary-location *text* write, not a dropped executable.

### What raises it

**SEC-01 and SEC-02 multiply.** In normal operation the main renderer never loads remote content —
the CSP is `img-src 'self' data:` and markdown runs with `html: false`. EOL Chromium is therefore
mostly latent. SEC-01 is what puts attacker JavaScript *into* that renderer, and SEC-03 loads remote
pages in a hidden window with `javascript: true`. Attacker JS on a Chromium carrying nine months of
public, patched-elsewhere n-days is where "archive damage" becomes "machine compromise."

**This coupling is the whole basis for the sequencing below.** Closing the navigation path removes
the way untrusted content reaches the renderer at all, which converts EOL Chromium from an active
exposure into latent debt — and buys the room to take the runtime upgrade slowly.

### Realistic worst cases, ranked

| | Impact | Needs attacker? | Probability |
|---|---|---|---|
| Worst outcome | Full archive exfiltration via SEC-01 — `qaListAll()` POSTed out, then optionally deleted | Yes, plus a user click | Low |
| **Worst *likely* outcome** | Bulk import freezes the main process → force-quit → thousands of orphaned pairs, and re-importing to fix it produces **nothing** | No | **High** |
| Worst *silent* outcome | One badly-timed crash corrupts a control file → app falls back to empty → next write permanently overwrites the recoverable original | No | Low per event, cumulative across customers |
| Confusing, recoverable | `settings.json` corrupts → `dataDirectory` resets to default → customer sees an empty archive and believes everything is gone | No | Low |
| Silent item loss | Malformed `.md` skipped from `listAllPairs()` with only a `console.error`; duplicate IDs overwrite one another in the returned map | No | Low |
| Wrong output | Anthropic `max_tokens: 2000` with unhandled `stop_reason` → truncated summaries presented as complete | No | Every long Anthropic call |

DEP-01 is the least severe of the three P0s despite the label — every advisory is DoS-class, worst
case "the app hangs on one archived item," recoverable. It is also the cheapest fix in the entire set.

The row that should drive urgency is the second one. It needs no attacker, the synchronous commit
makes Windows show "not responding" — which actively invites the force-quit that causes the damage —
and the duplicate-skip bug then makes the obvious remedy silently do nothing.

### Why each deferred security item is safe to defer

- **Sender guard (IPC-01).** Its purpose is to reject IPC from an unexpected frame. Once the main
  window cannot navigate and cannot open windows (S3), there is no unexpected frame to reject. The
  Gemini hidden window is constructed **without a preload**, so it has no `window.api` and no
  `ipcRenderer` — it cannot reach IPC by any route. The guard is defense-in-depth for a path S3
  closes.
- **Gemini session containment (SEC-03).** The hidden window already runs with `sandbox: true`,
  `contextIsolation: true`, `nodeIntegration: false`, and no preload, and its host is allowlisted to
  `gemini.google.com` / `share.gemini.google`. The two sharpest edges are closed in 1.4 anyway: S6
  drops `http:`, and S3's permission denial reaches this window because it shares the default
  session. What defers is the non-persistent partition, the popup handler, and redirect validation —
  all of which sit behind an allowlisted host and a window that cannot reach IPC.
- **Atomic writes (DATA-01).** This is the largest single item **not** fixed by 1.4, and the cost is
  explicit: the "worst silent outcome" row above stays open for customers until V2. It is deferred
  because it touches nine write sites across every persistence service — real soak territory, not an
  additive guard.

---

## Part 2 — 1.4 scope

Seven items. No Electron upgrade, no contract layer, no persistence refactor, no architectural work.

S1–S6 come from the review. S7 clears the GitHub issue tracker so V2 Phase 0 starts with nothing
outstanding. Every item is an additive guard, a single-expression fix, or repo/test hygiene — none of
them changes a code path that currently works.

### S1 — Release gate (TEST-01)

- Add `"check": "npm run typecheck && eslint . && npm test && vite build"` to `package.json`. The
  existing `lint` script carries `--fix`; `check` must call `eslint .` without it so the gate stays
  non-mutating.
- Repoint all five `electron:build*` scripts from `npm run build` to `npm run check`.
- Add `.github/workflows/ci.yml`: `npm ci && npm run check` on push and PR.
- Add `npm audit --omit=dev --audit-level=high` to `check` **after S2 lands** — it fails today.
- Fix the tag-dictionary test seam so the gate is honest: `tests/unit/bulkImport.test.ts:43-45` does
  not mock `tagDictionaryService`, so it reaches `app.getPath()` under `environment: 'node'` and
  throws — swallowed by the catch at `bulkImportService.ts:270`. Mock it and **assert `addTag` was
  called with the expected tags** (see D5).

**Files:** `package.json`, `.github/workflows/ci.yml`, `tests/unit/bulkImport.test.ts`

**Regression surface:** none. No shipped code changes.

### S2 — Dependency currency (DEP-01)

Lockfile only. No source changes.

- Regenerate so `markdown-it >14.1.1`, `linkify-it >=5.0.2`, `postcss >=8.5.18`, and gray-matter's
  nested `js-yaml >=3.15.0`. All four are satisfiable inside the existing caret ranges, so no
  `overrides` block is needed.
- Only gray-matter's private nested `js-yaml@3.14.2` is affected. The **top-level `js-yaml@4.3.0`**
  imported by `qaPairService.ts:4` is clean — do not "fix" the wrong one.
- Verify with `npm audit --omit=dev`, then confirm the **built** `dist/` and `dist-electron/` output
  contains the patched code. These packages are bundled by Vite rather than shipped as `node_modules`
  (`vite.config.mts:37-39`, `electron-builder.yml:6-9`), so a patched top-level declaration alone
  proves nothing.
- Add regression fixtures with a conservative execution-time ceiling: pathological smartquote input,
  repeated `mailto:` text, and a YAML merge-key chain. Dependency fixes do not replace
  application-level input budgets, and these stay useful after the V2 Electron upgrade.

**Files:** `package-lock.json`, `tests/unit/parserBudgets.test.ts` (new)

**Regression surface:** low. Patch-level bumps within existing ranges; the gate from S1 covers it.

### S3 — Navigation lockdown and link handling (SEC-01)

The highest-value item in the release. Closes the attack chain and de-fangs SEC-02.

- Set `sandbox: true` explicitly in `webPreferences`. It is on by default today, but the intended
  policy should be visible in code.
- Compute the single allowed origin: `VITE_DEV_SERVER_URL` in dev, `pathToFileURL(indexPath)` in prod.
- `webContents.on('will-navigate')` and `'will-frame-navigate'` → `preventDefault()` unless same-app.
- `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`.
- `session.setPermissionRequestHandler((_wc, _p, cb) => cb(false))` and
  `setPermissionCheckHandler(() => false)` on the default session. **This is deliberately scoped to
  the default session rather than the main window's session alone, because the Gemini hidden window
  shares it and therefore inherits the denial.** That is a genuine SEC-03 gain taken here for free;
  it is not a substitute for the deferred partition and redirect work. Verify with manual check 3
  that no import flow regressed.
- **Link handling:** delegate click on the rendered markdown container; `preventDefault()` on anchors;
  call a new `window.api.openExternal(href)`. The main-side handler parses the URL, accepts **`https:`
  only**, then calls `shell.openExternal`. Never pass the raw string through.
- Tighten `md.validateLink` to `http` / `https` / `mailto`.

**Files:** `electron/main.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`,
`src/components/MarkdownRenderer.vue`, `src/global.d.ts`

**Regression surface:** low. Nothing in the app navigates the main window or opens renderer windows
today, so denial breaks no existing flow. The one behavior change users will notice is intended:
links now open in the system browser instead of replacing the app.

### S4 — Filename sanitization (IPC-01, partial)

One expression. `qaPairService.ts:189-199` sanitizes `question` but not `source`, and
`join(dir, filename)` normalizes `..`.

- Strip `source` the way `firstWords` already is; reject path separators, NUL, and Windows reserved
  names.
- Reachable through `qa:create` and through an imported `.md` file's `source:` header
  (`qaImportFormatService.ts:110`), so the fix must live in main — the renderer's fixed `sourceOptions`
  dropdown is not a control.

**Files:** `electron/services/qaPairService.ts`

**Regression surface:** minimal. Legitimate `source` values are already in the sanitized character set.

### S5 — Bulk-import recoverability (IMP-01, partial)

The two-line fix from D1, and nothing else from that finding.

```ts
// bulkImportService.ts:321-323 — today the existing pair's id is dropped
if (selection.skipDuplicates && isDuplicate) {
  result.skippedDuplicates += 1
}
```

Push `originIndex.get(item.originId)` into `createdIds`. The thread is then created from pairs already
on disk instead of being skipped by the `createdIds.length > 0` check at `:356`.

This deliberately does **not** fix the freeze — that requires the yield, incremental saves, and hoisted
directory scan, all deferred. What it does is make the failure **recoverable**: after a force-quit,
re-running the same import threads the orphaned pairs and writes the missing ones. Today re-importing
produces nothing and the orphans are permanent.

It also fixes a live bug unrelated to crashes: re-importing an export you have already imported
currently produces zero threads.

**Files:** `electron/services/import/archive/bulkImportService.ts`, `tests/unit/bulkImport.test.ts`

**Regression surface:** low, and covered by a direct test (crash-then-reimport recovery).

### S6 — Gemini share links over HTTPS only (SEC-03, partial)

One condition. `providerDetection.ts:40` currently accepts both schemes:

```ts
if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
```

Drop `http:`. Today a Gemini share URL fetched over plaintext can be modified in transit by a hostile
network, and the injected content is then rendered with `javascript: true` in the hidden window — the
sharpest remaining edge in the import path, and the one that does **not** require a user click.

Return a structured `invalid-url` error rather than a bare `null` so the dialog can explain why.

**Files:** `electron/services/import/providerDetection.ts`,
`electron/services/import/sharedLinkImportService.ts`

**Regression surface:** minimal. Real Gemini share links are HTTPS; a user who pasted `http://` gets
a clear message instead of a silent unsupported-provider result.

### S7 — Clear the GitHub issue tracker

Four issues are open. All four are small, and closing them means V2 Phase 0 starts clean.

**#13 — [Security] unrestricted shell permissions in tracked Claude settings.** `.claude/settings.local.json`
grants `PowerShell(*)` and `Bash(*)`, and the file is tracked, so `.gitignore` does not stop Git from
distributing it — every clone inherits the policy.

The fix is *not* to narrow local permissions; commit `3844191` broadened them deliberately and that
is a legitimate personal choice. The fix is to stop shipping that choice to every checkout:
`git rm --cached .claude/settings.local.json` so it stays local and untracked. If a shared allowlist
is wanted, put a narrowly-scoped one in the tracked `.claude/settings.json` instead.

**#14 — unanchored ignore rule.** `.gitignore:27` → `/tag-dictionary.json`, matching the adjacent
root-scoped rules for `settings.json`, `threads.json`, and `archive/`. Without the leading slash the
rule hides any file of that name anywhere, including fixtures.

**#15 — path-boundary-safe e2e isolation assertion.** `tests/e2e/electron.fixture.ts:82-87` uses a
string `startsWith` to verify the resolved `userData` directory, so a sibling such as
`…/userdata-old` passes a check whose expected directory is `…/userdata`. This assertion is the
barrier that stops e2e runs from touching a developer's real settings and encrypted secrets, so it
must fail closed. The fixture creates one exact directory — compare normalized resolved paths for
equality. If descendants are ever intentionally allowed, use `path.relative` and reject absolute
results, `..`, and anything starting with `..` + separator.

**#8 — accelerator consistency audit.** Mostly already closed. `shared/accelerators.ts` plus
`tests/unit/accelerators.test.ts` landed after the issue was filed and deliver its "single source of
truth" outcome: display/behavior parity across all four surfaces via the `// @accel <id>` marker test,
intra-app chord-conflict detection, README table verification, and `Mod` reserved for the platform
modifier. `handleGlobalKeydown` normalizes through one `isMod = event.ctrlKey || event.metaKey`
(`App.vue:643`), so Cmd/Ctrl behavior is structurally correct too.

Residual scope, small enough to finish here:
- Write the modifier convention down. The table is now consistent — everything is `Mod+…` except
  `F2`, `Delete`/`Backspace`, `?`, `/`, `Escape`, and `Alt+Up`/`Alt+Down` — but the *rule* exists only
  as inference from the rows.
- Add a parity assertion for `worksInInput`. The table declares which three accelerators fire while a
  text input holds focus; nothing currently checks the handler's `isInputTarget` gating agrees.
- One manual pass for conflicts against Electron `role` accelerators and OS/browser defaults. The
  existing test covers intra-app collisions only.
- macOS runtime verification stays manual — there is no Mac runner in CI.

**Files:** `.claude/settings.local.json` (untrack), `.gitignore`,
`tests/e2e/electron.fixture.ts`, `shared/accelerators.ts`, `tests/unit/accelerators.test.ts`

**Regression surface:** none in product code. #13/#14 are repo hygiene, #15 is test-only, #8 is a
comment plus a test.

### What 1.4 explicitly does not fix

On the record, so nobody mistakes this for completeness:

- The bulk-import freeze remains. Large imports still block the main process and still show "not
  responding." 1.4 makes the outcome recoverable, not pleasant.
- All nine non-atomic write sites remain. A badly-timed crash can still corrupt a control file, and
  the app can still overwrite the recoverable original on the next write.
- Electron remains on the EOL 33 line.
- The Gemini hidden window still uses the default persistent session, with no popup handler and no
  redirect validation. S6 closes the `http:` edge and S3 denies permissions there, but the window is
  not yet contained.
- `fetchJson` still has no timeout, no redirect cap, and no response byte ceiling.
- Settings can still be left partially applied, and Anthropic output can still be silently truncated.

---

## Part 3 — V2 Phase 0 scope

Everything below moves to `doc/plans/V2_Master_Roadmap.md` **Phase 0.0**, sequenced first within
Phase 0, with the automated and manual soak time this work needs.

| Item | Finding | Why it needs soak |
|---|---|---|
| Electron `^33 → ^43`; `electron-builder ^25 → ^26` | SEC-02 | Ten majors plus a build-tool major. Known breaks already: `main.ts:275` `console-message` signature (changed in E37), and the builder bump. Gate on Windows OS support before merge. |
| Sender guard + zod payload validation at the IPC boundary; `shared/contracts/` | IPC-01, ARCH-01 | New runtime layer across 51 channels; a bad schema rejects legitimate traffic. Also reconciles the drifted `includeDateInThreadNames` and `originId` declarations. |
| Gemini session containment: non-persistent partition, deny popups, allowlisted redirects, redacted tokens. *`https:`-only and permission denial already landed in 1.4 (S6, S3).* | SEC-03 | Changes the transport that four provider imports depend on. |
| `fetchJson` policy: manual redirect with 3-hop cap, 20s timeout, byte ceiling, structured errors | SEC-03 | Same. |
| Atomic writes at all nine sites; refuse-to-save-after-failed-load; `threadService` try/catch; health-reporting for skipped/duplicate pairs | DATA-01, D7 #1 | Touches every persistence service. Needs failure-injection testing. |
| `ArchivePaths` authority; embedding namespacing, versioning, dimension guard, GC | DATA-02, D7 #5 | Changes on-disk layout; needs a migration path. |
| Bulk import: incremental `saveThreads`, hoisted ID allocation, `getPair` id→path map, async yielding commit, real cancellation | IMP-01, D7 #2, D7 #3 | Rewrites the commit loop and touches the hot path of every archive operation. |
| Aggregate budgets; `crypto.randomUUID()` preview IDs; TTL and `webContents` ownership; `previewThreadId` row identity; numeric shard ordering | IMP-02, D7 #4 | Changes the preview/selection contract between main and the dialog. |
| `safeStorage.getSelectedStorageBackend()`; atomic envelope write; legacy-plaintext migrate/purge | SEC-04 | Closes `CLAUDE.md` roadmap item #1. Depends on the atomic-write helper. |
| Settings draft: reordered save, explicit `testConnection` config, stale-catalog guard, `validateDataDirectory`, `useSettingsDraft` | SET-01 | Needs the jsdom Vitest project and state-machine tests. |
| LLM capabilities as data; `@anthropic-ai/sdk` swap | LLM-01 | Closes `CLAUDE.md` roadmap item #2. Reduces V2 Phase 0.1 to adding adapters. |
| `useCommandRegistry`, `useImportCoordinator`; replace the 15 untyped `llm:*` window events | ARCH-02 | Pure refactor; `vue-tsc` cannot catch a renamed event string today. |
| Documentation reconciliation | DOC-01, D7 #6 | Four drift sites; best done once the behavior settles. |

**Deferred beyond V2 Phase 0:**

| Item | Destination |
|---|---|
| Windows/macOS signing, checksums, provenance manifest | V2 Phase 5 |
| Main-process repository + validated command boundary (DATA-01 ownership half) | After Phase 0 |
| Async `safeStorage` API migration | Unscheduled — not a defect (D4) |
| `g.co/gemini/share/...` short-link resolution | Unscheduled — a feature, not a fix |
| Bulk-import staging directory, manifest, startup resume | Not planned — superseded by D1 |
| Temp-file spill for preview bodies | Not planned — superseded by D3 |

**Timebox the Electron upgrade.** Electron ships roughly every eight weeks, so the jump grows with
delay (33→44, 33→45). It should be first in Phase 0 with a committed date, not open-ended. EOL also
means an unpatched Node in main, which matters when `yauzl` inflates a zip a customer downloaded.

---

## Part 4 — Analytical record: divergences and additional findings

All seventeen review findings are accepted. Four of the proposed *remedies* are replaced. This section
exists so a future maintainer can distinguish a deliberate scope decision from an oversight. It applies
across both releases.

### D1. IMP-01 — no commit journal; fix the idempotency key instead

The review proposes a staging directory, an import manifest, a commit journal, and a startup
detect/resume/rollback flow, to protect against a crash mid-commit leaving `.md` files with no thread
(`saveThreads()` runs once, at `bulkImportService.ts:376`).

But the archive already has an idempotency key — `origin_id`, with a live index at `:289`. Re-running
a crashed import *should* be complete recovery, and fails only because the skipped duplicate's id
never reaches `createdIds`. Fixing that (S5) plus incremental saves (V2) delivers the recovery
property at a fraction of the journal's cost.

### D2. DATA-01 — safety properties, not the ownership migration

DATA-01 bundles crash safety with an ownership migration (main-side repositories,
`CreateThread`/`AddPairsToThread`/`MovePair` replacing whole-map `threads:save`). The second touches
every Pinia store and every import flow. V2 Phase 0 takes the safety half; the ownership migration
comes after.

### D3. IMP-02 — no temp-file spill for preview bodies

The finding is that previews leak for want of a TTL, owner, and cleanup. Spilling bodies to a temp
directory adds a *second* resource with a lifecycle that leaks the same way, on disk instead of in
RAM. IMP-02's own aggregate budgets bound preview size by construction. Budgets + TTL + ownership; no
spill.

### D4. SEC-04 — no async `safeStorage` migration

The synchronous API is not deprecated, and `secretBackendTypes.ts:59` documents the `SecretBackend`
contract as synchronous by design. Making it async ripples through the resolver, the precedence chain,
every backend, and the startup sweep — for a call that happens a handful of times per session. Take
`getSelectedStorageBackend()` and the atomic envelope write; leave the API shape alone.

### D5. TEST-01 — scope the "unexpected error logs fail the test" rule

A global console trap produces flaky suites and pressures maintainers to silence legitimate
negative-path logging that several tests rely on. Mock the service and assert the effect instead.

### D6. Factual corrections to the review

Verified against `npm audit --omit=dev` on 2026-07-28.

| Review states | Actual |
|---|---|
| `markdown-it >= 14.2.0` | Advisory range is `<=14.1.1`, so the requirement is `>14.1.1`. Both markdown-it advisories are **moderate**, not high. |
| `linkify-it >= 5.0.2` | Correct (advisory range `<=5.0.1`). |
| `js-yaml >= 3.15.0` on the gray-matter branch | Correct — and only there. The top-level `js-yaml@4.3.0` is clean. |
| PostCSS is a build-time exposure, not in the prod tree | Conclusion right, reasoning wrong. PostCSS **is** in the production tree (`vue → @vue/compiler-sfc → postcss`), which is why `--omit=dev` reports it. It is not executed at runtime, and `electron-builder.yml:9` excludes `node_modules`. Upside: `8.5.18` satisfies every existing range, so a lockfile bump clears it with no override and no allowlist. |

### D7. Defects found during verification that the review does not cover

1. **`threadService.loadThreads()` has no try/catch** (`threadService.ts:30-33`). *Corrected from an
   earlier draft of this plan:* this does **not** brick startup — `App.vue:154-166` wraps it in
   `Promise.allSettled` and shows an error toast. The real damage is one step later: `threads.value`
   stays `{}`, and the next thread mutation calls `threadStore.save()`, which writes `{}` plus the new
   thread **over the recoverable file**. Same silent-clobber pattern as the tag dictionary, and the
   same permanent outcome — loss of every thread.
2. **`getPair(id)` reads and gray-matter-parses the entire archive to find one id**
   (`qaPairService.ts:166-178`). Both `updatePair` and `deletePair` call it, so "delete 500
   duplicates" parses the whole archive 500 times. The review flags only `generateUniqueId`.
3. **`generateUniqueId`'s `readdirSync` is inside the retry loop** (`qaPairService.ts:291`), not once
   per pair — one full directory enumeration *per collision attempt*. Export timestamps cluster
   heavily within a conversation, which drives the retry loop, so this is worse than the review's
   O(n²) characterization and is the main cause of the import freeze.
4. **Empty-`sourceId` conversations are silently unimportable.** `BulkImportDialog.vue:248` disables
   the checkbox while the warning at `bulkImportService.ts:237-242` only mentions de-duplication. Side
   effect: `allSelected` can never be true, so "Select all" is permanently stuck.
5. **The tag-path split also breaks archive reset.** `archiveResetService.ts` looks for
   `tag-dictionary.json` under `getDataDir()` while it is written under raw `getDataDirectory()`. When
   the user selects the `archive` folder itself, reset reports `tags: 0` and leaves the dictionary in
   place.
6. **Four doc-drift sites, not three.** `electron/main.ts:73` — the in-app Usage Information text says
   archive maintenance lives in **View**, 120 lines above the menu that puts it in **Tools**.
7. **The Electron upgrade also forces `electron-builder ^25 → ^26`** (latest 26.15.3), unmentioned in
   SEC-02. And `main.ts:275`'s `console-message` signature changed in Electron 37 — a confirmed break.

---

## Part 5 — Verification for 1.4

`npm run check` green after each item.

**Automated, new in `tests/unit/`:**

- Same-window navigation to a remote URL is blocked (S3).
- A renderer-created window is denied (S3).
- An `http:` URL passed to `openExternal` is rejected; an `https:` URL reaches `shell.openExternal` (S3).
- `source: '../../evil'` through `qa:create` cannot write outside the archive directory (S4).
- Crash-then-reimport recovery: write pairs, abort before `saveThreads`, re-run the same import, assert
  threads are reconstructed with no duplicate pairs (S5).
- Parser budget fixtures stay under the time ceiling (S2).
- An `http://gemini.google.com/share/...` URL is rejected with `invalid-url`; the `https://` form is
  still detected as Gemini (S6).
- `worksInInput` parity: every accelerator declaring it is reachable past `isInputTarget` in
  `handleGlobalKeydown`, and every one that does not declare it is gated (S7 / #8).
- The e2e isolation assertion rejects a sibling directory sharing a string prefix, and accepts the
  exact isolated profile (S7 / #15).

**Manual, on the packaged Windows build:**

1. `npm run electron:build:win`, install, launch — confirms the S1 gate.
2. Click an external link in a rendered answer. It must open in the system browser, and the
   application window must not navigate. This is the single most important manual check in the
   release.
3. Import a shared link from each of Claude, ChatGPT, Gemini, and Copilot — confirms S3's default-session
   permission denial did not break the Gemini hidden-window path, and that S6 did not reject a real
   share URL.
4. Import a real Claude account export. Force-quit partway. Reopen and re-import. Confirm the archive
   is complete with no duplicate pairs and no orphaned pairs.
5. Create, edit, and delete a QA pair; confirm S4's sanitization did not change legitimate filenames.
6. Accelerator pass: exercise every chord in `ACCELERATORS` against Electron `role` accelerators and
   OS/browser defaults, and repeat on macOS for `Cmd` parity (S7 / #8). The intra-app conflict test
   already covers collisions inside the table.
7. Clone the repository fresh and confirm no unrestricted shell permissions are present (S7 / #13).
8. `npm audit --omit=dev` returns clean.

**Acceptance:** 1.4 does not attempt the review's full gate list
(`Release_Architecture_and_Stability_Review_2026-07-27.md:444-457`). It closes these four bullets:

- [x] Main window cannot navigate to remote content or create renderer windows.
- [x] Imported-content parser dependencies are on patched versions; the production audit has no
      untriaged high result.
- [x] `npm run check` is green; no probe-only or failing tracked tests.
- [x] Any externally distributed artifact is explicitly labeled a private unsigned build.

The remaining bullets are owned by V2 Phase 0 and Phase 5.

**Additional 1.4 exit criterion, outside the review:** the GitHub issue tracker has no open issues.
Issues #8, #13, #14, and #15 are closed by S7. V2 Phase 0 starts clean.
