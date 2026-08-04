# AGENTS

This file is the canonical instruction source for AI coding agents working in this repository.

## Purpose
- Build and maintain the Electron + Vue app safely.
- Prefer changes that preserve data integrity and improve operator speed.
- Keep notes and behavior decisions versioned in-repo.

## Required Context
Read these before making edits:
- `AGENTS.md` (this file)
- `doc/dev_process/build-notes.md`

## Startup Contract
Before substantial edits:
1. Read required context files.
2. Verify current baseline with `npm run build`.
3. After changes, run `npm run build` again.

## Source Of Truth For Repo Notes
- Use one mutable repo notes file: `doc/dev_process/build-notes.md`.
- If a fix changes behavior or workflow, update that file in the same PR.
- Do not create duplicate build-notes files.

## UX Priorities
- Optimize for high-throughput QA entry workflows.
- Minimize scroll and click friction in QA creation flows.
- Keep primary create actions discoverable and fast to trigger.

## Performance & Scalability
- Follow `doc/guides/PERFORMANCE_AND_SCALABILITY.md` for archive-scale requirements.
- The design target is 5,000 threads and 30,000 Q&As. Interactive input and local UI actions must not do archive-scale work on each event.
- Treat scalability as a design goal, not a late optimization: do not rescan, reparse, re-sort, serialize, or rebuild a large collection once per item, keystroke, selection, or ordinary lookup. Build and invalidate explicit indexes/projections when source data changes instead.

## Build And Packaging Guardrails
- Electron packaging uses `electron-builder.yml` via package scripts.
- Do not remove `ffmpeg.dll` assumptions from Windows runtime behavior: Electron binary references it.
- Keep Vite config on `.mts` files (`vite.config.mts`, `vite.config.server.mts`) to avoid CJS deprecation path.

## Coding Guardrails
- Prefer minimal, targeted edits.
- Avoid changing unrelated files.
- Preserve existing app behavior unless request explicitly asks for behavior change.
- Add concise comments only for non-obvious logic.

## Validation Expectations
- Required: `npm run build` passes for non-trivial changes.
- For UX regressions or workflow fixes, include a short manual reproduction check in PR notes.
- Do not automatically run persistent UI regression suites. They are expensive and are run by the user as part of the pre-push test pass; run them only when the user explicitly requests them.

## PR Checklist
- [ ] `npm run build` passed after edits.
- [ ] Updated `doc/dev_process/build-notes.md` when behavior/workflow changed.
- [ ] Reviewed and updated `README.md` (user-facing features, keyboard shortcuts, workflows) when any user-visible functionality was added or changed.
- [ ] Reviewed and updated any other documentation that describes affected functionality (in-app help dialogs, spec files under `doc/plans/`, guides under `doc/guides/`).
- [ ] Confirmed no unrelated file drift.
