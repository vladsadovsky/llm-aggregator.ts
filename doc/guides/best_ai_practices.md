# Best AI Practices

## What is the recommended best practice working across multiple agents and models to keep per repo notes each agent must take into account?
Use one canonical, tracked policy file and one mutable repo notes file, then enforce both in workflow entry and CI.

1. Create one canonical policy file at repo root.
- Recommended: `AGENTS.md`.
- Keep it short and operational.
- Include goals, constraints, coding conventions, build/test commands, must-read files, and forbidden actions.

2. Keep a single mutable per-repo notes file.
- Recommended: `doc/dev_process/build-notes.md`.
- Store session learnings, pitfalls, regressions, and validated fixes.
- Link it from `AGENTS.md` under required context.

3. Add model/tool shims that point to the same source.
- Examples: `copilot-instructions.md`, Cursor rules, `CLAUDE.md`.
- Keep shims thin: "Follow `AGENTS.md` and `doc/dev_process/build-notes.md`."

4. Enforce via automation, not only docs.
- Add PR checklist item for `AGENTS.md` compliance.
- Add CI check ensuring required files exist and referenced paths resolve.

5. Update notes atomically with code changes.
- If behavior or workflow changes, update notes in the same PR.
- Prevents instruction drift.

6. Prefer rules + examples over narrative prose.
- Use explicit do/don't rules and command snippets.

7. Include a startup contract.
- First actions: read policy files and run baseline build/tests.

## Suggested Minimal Structure
- `AGENTS.md` (canonical policy)
- `doc/dev_process/build-notes.md` (operational memory)
- Optional thin shim files for specific tools/models

## Claude-Specific Guidance For `CLAUDE.md`

If a repo is used with Claude Code or Claude Desktop-driven coding workflows, add a root-level `CLAUDE.md` file. Keep it as a thin, prescriptive shim. Do not turn it into a second policy source.

### Required role of `CLAUDE.md`

1. Point Claude to the canonical repo policy.
- First line should direct Claude to read `AGENTS.md` and `doc/dev_process/build-notes.md` before making substantial changes.
- Do not restate long policy prose already maintained elsewhere.

2. State the repo startup contract in Claude-friendly terms.
- Require Claude to read the canonical files first.
- Require a baseline validation command before non-trivial edits.
- Require the same validation command again after changes.

3. Encode only Claude-specific operating rules.
- Include rules that matter because Claude often works autonomously for longer stretches.
- Focus on approval boundaries, plan discipline, commit behavior, and how to handle uncertainty.

4. Keep it short enough to stay trustworthy.
- Target roughly 20-60 lines.
- If it becomes long, move general repo policy back into `AGENTS.md`.

### What `CLAUDE.md` should explicitly say

Use direct instructions, not suggestions.

- Read `AGENTS.md` and `doc/dev_process/build-notes.md` before substantial edits.
- Use the repo’s canonical build/test commands; do not invent alternates unless troubleshooting.
- Do not create new policy files when existing tracked files already define workflow.
- Update `doc/dev_process/build-notes.md` in the same change when behavior, workflow, or validation expectations change.
- Prefer minimal diffs and preserve existing repo conventions.
- Do not rewrite large files or reformat unrelated code unless explicitly required.
- If a change is risky, ambiguous, or destructive, stop and ask.
- Do not make commits, amend commits, or rewrite history unless explicitly asked.
- When a command fails, explain the real blocker and either recover or ask one focused question.

### What `CLAUDE.md` should not contain

- Full copies of `AGENTS.md`.
- Broad product requirements better stored in README or design docs.
- Temporary task notes.
- Personal preferences that are not repo policy.
- Tool-specific trivia that changes often and will go stale.

### Recommended `CLAUDE.md` structure

1. Scope
- Example: "This file is a Claude-specific shim. Canonical repo policy lives in `AGENTS.md`."

2. Required reads
- `AGENTS.md`
- `doc/dev_process/build-notes.md`

3. Validation contract
- Example: run `npm run build` before and after substantial edits.

4. Change discipline
- Minimal diffs only.
- Do not touch unrelated files.
- Update notes with behavior/workflow changes.

5. Escalation boundaries
- Ask before destructive or high-risk actions.
- Ask when multiple valid directions would materially change behavior.

### Recommended `CLAUDE.md` example

```md
# CLAUDE

This file is a Claude-specific shim. Canonical repo policy lives in `AGENTS.md`.

Before making substantial changes, read:
- `AGENTS.md`
- `doc/dev_process/build-notes.md`

Required validation:
- Run `npm run build` before non-trivial edits to confirm baseline.
- Run `npm run build` again after changes.

Operating rules:
- Keep diffs minimal and targeted.
- Preserve existing conventions and behavior unless the request calls for change.
- Do not create duplicate policy or notes files.
- If behavior or workflow changes, update `doc/dev_process/build-notes.md` in the same change.
- Do not commit, amend, or rewrite git history unless explicitly asked.
- Ask before destructive actions, broad refactors, or unclear product decisions.
```

### Claude-specific recommendations for autonomous coding sessions

Claude is particularly strong when allowed to execute multi-step work without constant interruption, so the repo instructions should constrain that autonomy clearly.

Required guardrails:

1. Force validation checkpoints.
- Tell Claude exactly which command must pass before work is considered complete.

2. Force note updates for behavior changes.
- Claude will often complete the code change and forget the operational note unless this is explicit.

3. Force escalation on destructive actions.
- Be explicit about `git reset`, mass deletion, lockfile churn, migration rewrites, and snapshot updates.

4. Force separation of canonical policy vs. mutable notes.
- Claude should not invent `CLAUDE.local.md`, `NOTES.md`, or duplicate instruction files when `AGENTS.md` and `build-notes.md` already exist.

5. Force concise status reporting.
- Instruct Claude to report what it is checking, what it changed, and what remains blocked.

### Prescriptive rule for snapshot and generated artifact updates

If the repo contains visual snapshots, generated reports, or baseline artifacts, `CLAUDE.md` should require explicit intent before accepting them as the new source of truth.

Recommended wording:

- Do not update visual baselines, golden files, or generated snapshots unless the current UI/output is intentionally accepted.
- If snapshots are updated, mention that explicitly in the summary and rerun the relevant validation.

### Prescriptive rule for MCP or chatbot integration files

If the repo contains Claude-specific MCP assets or chatbot bridge files, `CLAUDE.md` should tell Claude not to silently rewrite environment-specific paths or local integration templates without confirmation.

Recommended wording:

- Treat Claude Desktop config templates, MCP server launch paths, and machine-specific integration files as sensitive configuration.
- Prefer documenting required edits over hardcoding user-specific paths.
