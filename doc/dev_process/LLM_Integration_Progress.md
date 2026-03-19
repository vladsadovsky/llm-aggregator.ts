# LLM Integration — Implementation Progress

Spec: [doc/plans/LLM_Integration_Tasks.md](../plans/LLM_Integration_Tasks.md)
Original gap analysis: [doc/plans/LLM_Integration_Spec.md](../plans/LLM_Integration_Spec.md)

---

## Current State

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 0 | Tag Dictionary & Vocabulary Control | **DONE** | pending commit (message below) |
| 1 | Auto Titles (LLM) | PENDING | — |
| 2 | Auto Tags (LLM) | PENDING | — |
| 3 | Semantic Search Completion | PENDING | — |
| 4 | Legacy Retagging & Batch Operations | PENDING | — |

---

## Phase 0 — Tag Dictionary & Vocabulary Control (DONE)

**Date completed:** 2026-03-19
**Committed:** pending — commit message drafted, not yet committed by user

**Commit message:**
```
Tag dictionary and vocabulary enforcement (Phase 0)

- New tagDictionaryService with load/save/add/remove/rename/alias/sync, file-backed with in-memory cache
- AppSettings extended with tagEnforcement (off/warn/strict), tagSoftLimit, tagHardLimit
- IPC handlers for all tag dictionary operations; cache invalidated on settings:save
- Pinia tagStore with effectiveEnforcement (auto-strict at hard limit) and atSoftLimit computed
- QAEditor and QAEditForm: alias resolution in commitPendingTags, strict blocking, warn hints, auto-add to dictionary on save
- TagManagerDialog: add/edit/rename/delete tags and aliases, usage counts, sync-from-archive button
- SettingsDialog: Tags section with enforcement mode selector, limit inputs, and "Manage tags…" button
- App.vue bootstraps tagStore on startup; api-mock updated
- vitest.config.ts for Node-environment unit tests; tests/unit/tagDictionary.test.ts with 30 cases covering all service functions
```

**New files:**
- `electron/services/tagDictionaryService.ts` — core service; dictionary stored at `<dataDirectory>/tag-dictionary.json`
- `src/stores/tagStore.ts` — Pinia store; loaded once in App.vue, used reactively in editors
- `src/components/TagManagerDialog.vue` — modal for managing dictionary (add/edit/rename/aliases/delete/sync)
- `tests/unit/tagDictionary.test.ts` — 30 unit tests (all passing)
- `vitest.config.ts` — Node-environment config required for testing electron/ services (see deviation note)

**Modified files:**
- `electron/services/settingsService.ts` — 3 new fields: `tagEnforcement`, `tagSoftLimit`, `tagHardLimit`
- `electron/ipc/handlers.ts` — 9 new tag IPC handlers; `settings:save` invalidates tag cache
- `electron/preload.ts` — `TagEntry`, `TagDictionary` types; 9 new `window.api.tags*` methods
- `src/global.d.ts` — mirrors preload types and API
- `src/components/QAEditor.vue` — enforcement + alias resolution in `commitPendingTags`; warn/strict hints; auto-add new tags to dictionary on save
- `src/components/QAEditForm.vue` — same enforcement changes as QAEditor
- `src/components/SettingsDialog.vue` — Tags section: enforcement selector, soft/hard limit inputs, "Manage tags…" button, tagStore.load() on save
- `src/App.vue` — tagStore.load() on startup (non-fatal if fails)
- `src/api-mock.ts` — stub implementations for all tags* methods
- `package.json` — `test` and `test:watch` scripts now use `--config vitest.config.ts`

**Deviations from spec (LLM_Integration_Tasks.md):**

1. **`tagsSave` IPC method exposed but not actively used from renderer.** The renderer mutates the dictionary exclusively through the fine-grained methods (`tagsAdd`, `tagsRemove`, etc.). `tagsSave` is wired up for completeness but the TagManagerDialog does not call it directly.

2. **Tag Manager "Retag archive" section deferred to Phase 4.** The dialog shows a static note pointing to the future feature; no retag UI exists yet. This is intentional — Phase 4 owns batch retag.

3. **`vitest.config.ts` added (not in spec).** Required because `vite-plugin-electron-renderer` (in the main `vite.config.mts`) rewrites Node.js built-ins (`fs`, `path`) into `require()`-based shims that fail in ESM/Vitest. Unit tests for `electron/` services must always use this separate config. The `npm test` script was updated accordingly.

4. **`tagEnforcement` defaults to `'warn'` not `'off'`.** The spec listed `'warn'` as default; implemented as specified. Existing archives without a `tag-dictionary.json` bootstrap automatically via `syncFromArchive()` on first `tagsLoad`.

---

## Phase 1 — Auto Titles (LLM) (PENDING)

Not started. See spec section in LLM_Integration_Tasks.md.

Key prerequisite: `hasApiKey` flag (IPC `ai:hasApiKey` → bool) so editor buttons can show disabled state without loading secrets into renderer.

---

## Phase 2 — Auto Tags (LLM) (PENDING)

Not started. Depends on Phase 0 (tag dictionary) being in production use first.

---

## Phase 3 — Semantic Search Completion (PENDING)

Not started. Single-change phase: fire-and-forget `generateEmbedding()` after `qa:create` and `qa:update` handlers.

---

## Phase 4 — Legacy Retagging & Batch Operations (PENDING)

Not started. Depends on Phase 0 dictionary being populated with real data.
