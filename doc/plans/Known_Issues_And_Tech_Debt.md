# Known Issues & Technical Debt

Backlog of known limitations and technical debt. This is **planning input, not a
release gate**. Feature-level future work lives in
[`V2_Master_Roadmap.md`](V2_Master_Roadmap.md); AI-metadata-specific
observations are in that file's "Observations from the audit" section. This file
holds the lower-level code/UX debt that doesn't map cleanly to a roadmap phase.

Moved out of `CLAUDE.md` on 2026-08-02 (that file is for durable architecture /
conventions, not planning). Stale entries were dropped in the move (the repo now
has a full unit-test suite; keyboard delete now routes through the same confirm
dialog as mouse delete).

## Open items

1. **No optimistic UI / loading states.** IPC calls are awaited silently — no
   spinners or progress affordances during file I/O. Large archives make the
   silence noticeable.

2. **`qaListAll()` bulk-loads every file.** P0-D added an archive-scoped
   id→path index (used by `getPair`/update/delete/import), but `listAllPairs()`
   still reads and parses every `.md` on each full load. A cache / incremental
   load is still wanted for large archives.

3. **Search is in-process and unindexed.** `searchService.ts` iterates all pairs
   on every query. The Phase 0.5 query engine (`shared/query/queryEngine.ts`) is
   a pure predicate builder but is **not yet wired** into the live search path;
   see roadmap 1.1 (threads) and 3.2 (advanced QA filters).

4. **Dev data-directory location is confusing.** In development the archive /
   control files can land next to the project rather than in a clearly separate
   location, which is easy to mistake for repo files.

5. **Thread reordering is ±1 only.** `moveInThread` moves an item one position at
   a time; there is no drag-and-drop reordering.

6. **`version` frontmatter is not surfaced.** `qaUpdate()` increments `version`
   on every edit, but there is no version history or diffing in the UI (the
   metadata bar shows the current number only). Related: roadmap 3.3
   (undo/redo + edit history).

## Notes

- When an item here is resolved, remove it in the same change and note it in
  `doc/dev_process/build-notes.md`.
- Do not fix items here speculatively — they are recorded so they aren't
  rediscovered, not as a work queue. Fix on explicit request or when a related
  change makes it cheap.
