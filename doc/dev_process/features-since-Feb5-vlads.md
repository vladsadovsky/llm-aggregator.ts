# Features Implemented Since 56b8a7ec54d684c375aee75fbaac711f9f6631e5

Date: 2026-03-12

This list is evidence-based and not derived from commit titles alone. It combines:

- post-base file deltas (`git diff` range)
- implemented behavior in UI/store/service code
- executable coverage in e2e/visual tests
- updated user/developer docs and scripts

## Scope Summary

- Key product areas with substantial post-base implementation:
	- `src/components/QAEditor.vue`
	- `src/components/QAContentPanel.vue`
	- `src/components/ThreadsPanel.vue`
	- `src/components/QAListPanel.vue`
	- `src/stores/uiStore.ts`
- New automation and regression assets added post-base:
	- `tests/e2e/merged-features.spec.ts`
	- `tests/visual/layout.spec.ts`
	- `tests/visual/theme.spec.ts`
	- `scripts/playwright-electron.sh`
	- `vite.config.mts`, `vite.config.server.mts`

## Implemented Features

### 1. Collapsible panel layout controls

- Added collapse/expand toggles for Threads and QA List panes in the main shell.
- Added a recovery button to re-open the threads pane from list panel when collapsed.
- Persisted collapsed state in local storage.

Evidence:
- `src/App.vue` (`threads-panel-toggle`, `list-panel-toggle`)
- `src/components/QAListPanel.vue` (`show-threads-button`)
- `src/stores/uiStore.ts` (`threadsCollapsed`, `listCollapsed`, persistence keys)
- `tests/e2e/merged-features.spec.ts` (collapse/reopen scenario)

### 2. Unthreaded QA workflow

- Introduced explicit Unthreaded mode in thread navigation.
- Added dedicated unthreaded list item and mode switching.
- Added empty-state messaging when all QAs are already assigned.

Evidence:
- `src/components/ThreadsPanel.vue` (`show-unthreaded-button`, unthreaded virtual item)
- `src/components/QAListPanel.vue` (`showUnthreaded` display logic)
- `tests/e2e/merged-features.spec.ts` (unthreaded mode assertions)

### 3. Add/remove QA membership across threads from content panel

- Added “add to thread” selector directly in QA content view.
- Added remove-from-thread control while keeping file data intact.
- Displayed per-QA thread membership chips.

Evidence:
- `src/components/QAContentPanel.vue` (`add-to-thread-select`, thread chip/remove UI)
- `tests/e2e/merged-features.spec.ts` (assign unthreaded QA into a thread)

### 4. Content zoom controls with persisted level

- Added zoom out/in controls and current zoom label in QA content panel.
- Added reset-on-double-click for zoom label.
- Persisted zoom level in local storage.

Evidence:
- `src/components/QAContentPanel.vue` (`zoom-label`, zoom buttons)
- `src/stores/uiStore.ts` (`contentZoom`, `zoomIn`, `zoomOut`, `zoomReset`, persistence)
- `tests/e2e/merged-features.spec.ts` (zoom interaction check)

### 5. Faster QA creation workflow and metadata memory

- Added metadata memory (source/tags/url) for new QA forms.
- Added settings control to enable/disable remembering metadata.
- Added action to clear remembered metadata.
- Added target-thread selection in create dialog, including “create new thread” option.

Evidence:
- `src/components/QAEditor.vue` (prefill and target thread flow)
- `src/components/SettingsDialog.vue` (remember toggle, clear action)
- `src/stores/uiStore.ts` (last-used metadata and thread persistence)

### 6. Structured paste parsing and batch QA creation

- Added parsing of pasted multi-QA text in supported formats.
- Added pending-batch detection and batch create action.
- Added “Create & Add Another” fast entry path.

Evidence:
- `src/components/QAEditor.vue` (`parseStructuredPaste`, `createParsedBatch`, batch controls)

### 7. Tag suggestion and URL validation improvements in editor flows

- Added tag suggestions based on existing tags.
- Added URL validation and invalid-format blocking during save.

Evidence:
- `src/components/QAEditor.vue` (`searchTags`, `urlError` handling)
- `src/components/QAEditForm.vue` (URL validation and tag suggestions)

### 8. Search UX enhancements in QA list

- Added real-time debounced search-as-you-type (400ms).
- Kept search available across thread/all/unthreaded contexts.
- Added search type selector (full text vs tags) and sort selector.

Evidence:
- `src/components/QAListPanel.vue` (debounced `watch` + search controls)
- `tests/e2e/search.spec.ts` (search behavior)

### 9. Command palette and expanded keyboard-driven workflow

- Added command palette and richer keyboard shortcut support.
- Added shortcuts help overlay and additional shortcut actions (including duplicate).

Evidence:
- `src/App.vue` (command dialog, shortcut table)
- `README.md` (expanded shortcut documentation)

### 10. QA ID collision hardening for rapid entry

- Replaced minute-granularity IDs with second+millisecond timestamp IDs.
- Added archive collision check with increment fallback to ensure uniqueness.

Evidence:
- `electron/services/qaPairService.ts` (`formatTimestamp`, `generateUniqueId`)
- `doc/dev_process/build-notes.md` (collision issue + fix note)

### 11. Playwright Electron test harness and visual regression support

- Added isolated temp data directory fixture to keep tests from polluting repo data.
- Added merged-features e2e scenario coverage.
- Added visual regression snapshots for layout and theme toggle.
- Added npm script entrypoints for e2e/visual runs and snapshot updates.
- Added repo helper script for targeted Electron Playwright runs.

Evidence:
- `tests/e2e/electron.fixture.ts`
- `tests/e2e/merged-features.spec.ts`
- `tests/visual/layout.spec.ts`, `tests/visual/theme.spec.ts`
- `package.json` (`test:e2e`, `test:visual`, `test:visual:update`, etc.)
- `scripts/playwright-electron.sh`
- `README.md`, `BUILD.md` (workflow documentation)

### 12. Build config modernization and packaging polish

- Migrated Vite config usage to `.mts` files to avoid CJS deprecation path.
- Updated build scripts to use `.mts` config files.
- Expanded/reworked icon assets and packaging references.

Evidence:
- `vite.config.mts`, `vite.config.server.mts`
- `package.json` (`dev`, `dev:server`, `electron:dev` script updates)
- `electron-builder.yml` (explicit per-platform icon setup)
- `doc/dev_process/build-notes.md` (CJS deprecation note)

### 13. Primitive MCP integration assets for Claude Desktop

- Added MCP server implementation and config scaffolding for exposing conversation archive to Claude Desktop.

Evidence:
- `build/claude/claude-conversation-mcp/index.js`
- `build/claude/claude-conversation-mcp/package.json`
- `build/claude/config/claude_desktop_config.json`
- `README.md` section: “Integration with Claude Desktop as an MCP server”

## Notes

- This document reports implemented features in the current `master` state relative to commit `56b8a7ec54d684c375aee75fbaac711f9f6631e5`.
- Because several commits were aggregate/merge commits, feature identification is grounded in current code/tests/docs evidence rather than commit labels.
