# Build Notes

- `npm run build` runs `vue-tsc --noEmit && vite build`; type errors can block config verification.
- Use `npx vite build` to validate Vite/Rollup config behavior independently of TS typecheck failures.
- Vite CJS deprecation warning in this repo was resolved by renaming `vite.config.ts`/`vite.config.server.ts` to `.mts` and updating script references.
- QA creation IDs were minute-granularity and caused collisions during rapid create flows; switched to second+millisecond IDs with filesystem collision check.
- UX preference for this repo: optimize QA entry for high-throughput streams (keep primary create actions always visible and minimize scrolling/click friction).
- Electron Playwright coverage uses a temporary isolated working directory in `tests/e2e/electron.fixture.ts` so e2e runs do not write `threads.json` or `archive/` into the repo root.
