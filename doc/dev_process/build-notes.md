# Build Notes

- `npm run build` runs `vue-tsc --noEmit && vite build`; type errors can block config verification.
- Use `npx vite build` to validate Vite/Rollup config behavior independently of TS typecheck failures.
- Vite CJS deprecation warning in this repo was resolved by renaming `vite.config.ts`/`vite.config.server.ts` to `.mts` and updating script references.
- QA creation IDs were minute-granularity and caused collisions during rapid create flows; switched to second+millisecond IDs with filesystem collision check.
- UX preference for this repo: optimize QA entry for high-throughput streams (keep primary create actions always visible and minimize scrolling/click friction).
- Electron Playwright coverage uses a temporary isolated working directory in `tests/e2e/electron.fixture.ts` so e2e runs do not write `threads.json` or `archive/` into the repo root.
- Playwright usage is now intentionally split between stable npm scripts in `package.json` (`test:e2e`, `test:e2e:debug`, `test:e2e:ui`, `test:e2e:report`) and explicit ad hoc CLI examples in `README.md` and `BUILD.md` for single-spec and filtered runs.
- When a documented Playwright command becomes a reusable repo-specific workflow, prefer a checked-in helper under `scripts/` over leaving the exact command line only in documentation. Current helper: `scripts/playwright-electron.sh`.
- Visual snapshot maintenance now has explicit scripts: `test:visual` to run visual regression checks and `test:visual:update` to accept the current UI as the new approved baseline when that change is intentional.
- Documentation was consolidated so README.md is now the canonical user/developer guide; BUILD.md is a short pointer to avoid duplicated instructions drifting.
