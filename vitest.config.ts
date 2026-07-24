import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests for Electron main-process code run in Node.js (no DOM, no electron-renderer shims)
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
