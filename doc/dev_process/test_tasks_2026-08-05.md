# Manual Test Tasks — 2026-08-05

Short-lived checklist for validating the completed review follow-up phases. Run in a disposable test archive where practical. Do not use this file as permanent product documentation.

## Working agreement for today

For every subsequent design or implementation step completed today, add its proposed manual checks to this file and include the same checks in the handoff report. Remove or archive this short-lived checklist when today's work is complete.

## Suggested manual checks

### 1. Thread persistence

1. Create a thread and restart the app; confirm it remains.
2. Rename the thread and restart; confirm the new name remains.
3. Add a Q&A to the thread, remove it, and restart after each operation; confirm membership is correct.
4. Reorder Q&As within the thread, restart, and confirm their order remains.

### 2. Q&A moves

1. Move one Q&A from a selected thread to another thread through the context menu.
2. Confirm it disappears from the source, appears once in the destination, and remains correct after restart.
3. Select multiple Q&As and use the bulk **Move to thread** action; confirm every selected Q&A moved and the selection clears only after success.

### 3. Q&A create, edit, and delete

1. Create a Q&A, edit its title/tags/body, and delete another Q&A.
2. Restart the app and confirm the list contents, the edited data, and the active selection are consistent with the saved archive.
3. After deleting the currently selected Q&A, confirm no stale detail panel remains selected.

### 4. Grok source

1. Open **Add Q&A** and confirm **Grok** appears in the Source list.
2. Select Grok, save a Q&A, reopen it, and confirm the saved source is Grok.
3. Edit an existing Q&A and confirm Grok also appears in the edit-form Source list.
4. If using keyboard source selection, confirm the displayed Alt+number ordering selects the expected source.

### 5. Renderer-to-main bridge smoke check

1. Launch the application and open Settings; load and save an unchanged setting.
2. Create, edit, and delete a test Q&A, then create and rename a test thread.
3. Confirm no `window.api` errors, structured-clone errors, or missing-function errors appear in the developer console.

### 6. Roadmap scope boundary

1. Read the **Post-review scope boundary — LLM follow-up** section in the V2 roadmap.
2. Confirm it preserves the decision: small product-facing LLM quality work can be scoped separately, while renderer decomposition and generic provider/settings/suggestion frameworks are explicitly deferred and non-gating.

## Follow-up observations

Record any unexpected toast, missing saved change after restart, incorrect Q&A membership, duplicate Q&A, or stale selection here before filing a fix.
