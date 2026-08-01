import { defineConfig } from 'vitest/config'

/**
 * Root Vitest config. Test projects (Node "unit" + jsdom "renderer") are defined
 * in `vitest.workspace.ts`, which Vitest auto-detects; this file exists so Vitest
 * resolves its root config here rather than falling back to `vite.config.mts`
 * (which carries the Electron build plugins).
 */
export default defineConfig({})
