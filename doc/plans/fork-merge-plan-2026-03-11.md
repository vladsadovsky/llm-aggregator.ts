# Fork Merge Plan - 2026-03-11

## Goal

Merge the feature-bearing fork at `c:\ws\git\ai\llm-aggregator` into the current workspace repo at `c:\ws\git\ai\llm-aggregator.ts` without regressing the stronger renderer, Electron, packaging, and workflow improvements already present in the current workspace.

Working branch for integration:

- `merge/fork-master-2026-03-11`

Base strategy:

- Keep `llm-aggregator.ts` as the integration base.
- Merge fork capabilities by feature family rather than by blunt file replacement.
- Preserve current-workspace implementations where they are newer, safer, or more complete.
- Keep shell-level layout decisions reversible while the branch is under manual review.

## Repo Comparison Summary

### Stronger in current workspace

- More complete Electron main-process and service setup.
- Better fast-entry QA workflow and richer editor/draft behavior.
- More mature packaging/config state, including `.mts` Vite config migration.
- Better docs and process notes around build and UX priorities.
- Existing Playwright scaffolding and testing structure, even though parts needed repair.
- Retry wrapper and safer persistence flow in stores/services.

### Present only in current workspace before merge

- Fast QA entry flow with always-available create affordances and keyboard-oriented create/edit actions. Origin commit: `f73a1c7` (`103c440` on the parallel line; refined by `e57f6e5`). This is the QAEditor-centered workflow for high-throughput capture: auto-filling title from question text, structured paste parsing, `Create & Add Another`, and direct keyboard submission with `Ctrl/Cmd+Enter` and `Ctrl/Cmd+Shift+Enter`. It is not just “faster entry” in the abstract; it is a concrete multi-step capture loop optimized to keep the operator in the editor instead of bouncing through the rest of the UI.
- QA editor draft persistence and restore behavior. Origin commit: `f73a1c7`. The UI store persists an in-progress QA draft plus its target-thread context, and the editor restores that state when reopened. This matters because the current workspace can preserve partially entered Q/A content across open/close cycles instead of treating the editor as a disposable modal.
- Remember-last-metadata workflow for source, tags, and URL reuse during repeated entry. Origin commit: `f73a1c7`. The current workspace stores the last used source, tags, and URL in the UI store and rehydrates them into subsequent create flows when the preference is enabled. In practice this removes repeated re-entry for batch capture from the same model, page, or conversation source.
- Last-used-thread targeting support in the create flow. Origin commit: `f73a1c7`. QA creation in the current workspace can default to the explicitly requested thread, otherwise the currently selected thread, otherwise the remembered last-used thread. That fallback chain is part of the fast-entry ergonomics and was one reason automated tests later had to account for default assignment behavior.
- Global command and shortcut-oriented interaction patterns already wired in the shell. Origin commit: `174e8f5` (expanded by `f73a1c7`). The app shell already supports a command palette and global shortcuts for search focus, new QA, settings, help, rename thread, edit/delete/duplicate QA, and thread movement actions. This is not a cosmetic shortcut layer; it is a real workflow surface that reduces pointer travel and keeps the app operable from the keyboard.
- Mock API bootstrap and related renderer-side development support. Origin commit: `9cb60b3`. The current workspace includes `src/api-mock.ts` so the renderer can be exercised without the full Electron backend path in place, which makes isolated UI iteration and debugging much easier. That dev-only seam did not come from the fork.
- More mature Electron startup, IPC, and service organization. Origin commit: `56b8a7e`, with subsequent cleanup and consolidation in `174e8f5` and later commits. The current workspace has a clearer split between Electron main, preload, IPC handlers, and service modules such as QA, search, settings, threads, logging, and path resolution. That structure is materially easier to extend and debug than the fork’s older baseline.
- Packaging and build configuration already aligned with the current Electron/Vite setup, including `.mts` Vite config files. Origin commit: `2598267`. This is the repo line that fixed the Vite CJS deprecation path by moving to `vite.config.mts` and `vite.config.server.mts`, while preserving the Electron build/package scripts and `electron-builder.yml` flow. The fork did not carry that migration, so this was an important current-workspace-only operational improvement.
- Existing build/process documentation and repo notes that document workflow expectations. Origin commits: `45b0095` for the build/debugging documentation, then `6babc8e` for repo-level AI/workflow notes. The current workspace has explicit docs for build/run/package behavior plus in-repo process notes such as `AGENTS.md` and `doc/dev_process/build-notes.md`. Those files matter because they encode constraints like mandatory build validation, packaging guardrails, and workflow priorities instead of leaving them implicit.
- Existing Playwright project structure and Electron test fixture baseline, even though acceptance hardening was still needed. Origin commit: `944ee96` (`91c5f3a` on the parallel line). The current workspace already had a Playwright project definition, Electron fixture entrypoint, and initial e2e/visual spec layout before this merge session touched testing. Even though those tests later needed repair and isolation work, the baseline structure itself was a current-workspace capability.
- Primitive manual integration with Claude chatbot as an MCP server. Origin commit: `e2cf6ff` (`3a892a9` on the parallel line). The current workspace includes `build/claude/claude-conversation-mcp`, the accompanying Claude Desktop config template, and README instructions for exporting saved conversations so Claude can query them through MCP. This is important because it extends the app beyond local browsing: the saved thread archive can also be surfaced back into the chatbot workflow through the MCP bridge.

### Present in fork only before merge

- Thread tags on thread entities.
- Thread tag filtering in the thread list.
- Unthreaded virtual view.
- Multi-thread membership actions from QA content.
- Move QA to start/end of thread.
- Merge selected QA with the next QA in the same thread.
- Content zoom controls.
- Alternate shell behavior with explicit collapse buttons for Threads and QA List panels.

### Duplicates implemented differently

- App shell layout and collapse behavior.
- Thread/list interaction flows.
- QA content action area.
- Thread management UI.
- QA creation targeting behavior.

## Conflict Risk Areas

### High-risk files

- `src/App.vue`
- `src/components/ThreadsPanel.vue`
- `src/components/QAListPanel.vue`
- `src/components/QAContentPanel.vue`
- `src/stores/threadStore.ts`
- `src/stores/uiStore.ts`

### Medium-risk files

- `src/types/Thread.ts`
- `src/components/QAEditor.vue`
- `electron/services/settingsService.ts`

### Why these areas are risky

- They combine UI state, navigation, persistence, and keyboard-flow behavior.
- The current workspace and fork both touched them significantly but with different priorities.
- Replacing whole files would likely regress current-workspace advantages.

## Recommended Merge Approach

### Phase 1: data and state model

- Add thread tags to the thread schema.
- Merge thread-store helpers for tags, unthreaded derivation, and membership operations.
- Merge UI-store state for unthreaded mode, zoom, and panel collapse persistence.
- Preserve current-workspace draft state, metadata memory, dark mode, and last-used-thread behavior.

### Phase 2: thread and list UI

- Merge thread tags/filtering into `ThreadsPanel`.
- Add the Unthreaded entry and associated selection flow.
- Merge unthreaded handling into `QAListPanel`.
- Preserve current-workspace search, keyboard navigation, and create-flow ergonomics.

### Phase 3: QA content actions

- Merge multi-thread membership UI into `QAContentPanel`.
- Add move-to-start, move-to-end, and merge-with-next actions.
- Add zoom controls.
- Preserve current-workspace edit, duplicate, delete, and focus restoration behavior.

### Phase 4: shell/layout decision

- Treat the fork collapse shell as a shell-level experiment that can be swapped independently.
- Keep this decision reversible in the integration branch until manual review settles it.

## Implemented Merge Result

Merged on the integration branch:

- Thread tags and thread-tag filtering.
- Unthreaded mode.
- Thread membership controls in QA content view.
- Move QA to start/end of thread.
- Merge QA with next QA.
- Content zoom controls.
- Collapse-button shell behavior for Threads and QA List.

Intentionally preserved from current workspace:

- Faster QA create/edit workflow.
- Existing metadata memory and draft handling.
- Current Electron main-process and packaging setup.
- Current retry and persistence behavior where it was already stronger.
- Existing command and keyboard-oriented workflow patterns.

## Current Shell Decision

Status on integration branch `merge/fork-master-2026-03-11`:

- The fork-style thread/list collapse behavior was intentionally wired into the live shell for manual evaluation.
- The current branch again uses the fork-style collapse buttons for both Threads and QA List.
- This is now the active review direction, with the option to combine it later with the original splitter behavior if desired.

Current merge stance:

- For the integration branch, prioritize the incoming fork behavior for thread/list collapse for now.
- The collapse-button shell is part of the current review candidate again.
- Other already-merged areas still intentionally preserve the stronger current-workspace implementations where the fork was older or less complete, while keeping the merged fork features in thread/list/content workflows.

## Manual UI Checkpoint Note

Use this checklist during manual evaluation of the merged UI:

1. Collapse the Threads panel and confirm the QA list expands, the content panel remains usable, and the toggle restores the panel cleanly.
2. Collapse the QA List panel and confirm the content panel remains usable, the toggle restores the list cleanly, and no selection is lost.
3. Collapse the Threads panel, then use the reopen control from the QA list header and confirm the Threads panel reopens correctly.
4. In normal thread mode, select a thread, select a QA, and verify the breadcrumb, action bar, and content panel still match the current selection.
5. Switch to All QAs mode and confirm search, sort, and QA selection still work with the collapse-button shell.
6. Switch to Unthreaded mode and confirm the list populates correctly, Add QA is enabled, and selection behaves normally.
7. Create a QA from thread mode and from unthreaded/all-QA mode and confirm the create dialog still opens and saves into the expected location.
8. Edit an existing QA and confirm save, cancel, and keyboard shortcuts still work with the collapse-button shell.
9. Duplicate a QA and confirm the new draft opens with copied content and the expected thread targeting.
10. Test thread membership actions from the content panel: add to thread, remove from thread, move in thread, move to start/end, and merge with next.
11. Use keyboard navigation in the thread list and QA list and confirm selection still moves predictably after panel collapse/expand operations.
12. Toggle dark mode and open Settings to confirm overlay dialogs still layer and close correctly with the current shell.

Acceptance bar for keeping the collapse-button shell:

- No broken navigation or selection state after collapse/expand.
- No regression in fast QA entry and edit workflows.
- No confusing panel restore behavior.
- No visual clipping or unusable states in All QAs, Unthreaded, or thread mode.

## Review Status Note

The branch is intended to be usable for human review of merged fork features.

Review focus:

- Verify the merged fork features are all present in the current workspace UX.
- Verify the collapse-button shell is acceptable for real usage.
- Decide later whether to keep the current shell as-is or combine it with the prior splitter approach.

## Playwright Status

Playwright acceptance work was started but intentionally postponed.

Reason for postponement:

- The branch already reached a useful state for human usability review.
- The remaining Playwright work was mostly reliability and isolation hardening rather than merge-critical functionality.

Notes:

- Test hooks were added in key UI surfaces.
- Electron fixture isolation was improved with a temporary data directory override.
- Acceptance specs are not yet reliable enough to be treated as the merge gate.

## Recommended Next Actions After Human Review

1. Keep the current collapse-button shell as-is, or revise it into a hybrid with the old splitter behavior later.
2. After that decision is stable, resume Playwright hardening and convert the current partial specs into reliable acceptance coverage.
3. Prepare a commit-ready summary once the shell decision is stable.