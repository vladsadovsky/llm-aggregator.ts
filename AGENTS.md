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

## PR Checklist
- [ ] `npm run build` passed after edits.
- [ ] Updated `doc/dev_process/build-notes.md` when behavior/workflow changed.
- [ ] Reviewed and updated `README.md` (user-facing features, keyboard shortcuts, workflows) when any user-visible functionality was added or changed.
- [ ] Reviewed and updated any other documentation that describes affected functionality (in-app help dialogs, spec files under `doc/plans/`, guides under `doc/guides/`).
- [ ] Confirmed no unrelated file drift.
