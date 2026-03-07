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
