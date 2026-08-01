import { defineWorkspace } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Two Vitest projects under one aggregate `npm test` (plan section 14.1):
 *  - "unit"     — Electron main-process / pure-logic code in Node.js (no DOM).
 *  - "renderer" — Vue composables/components in jsdom, with @vue/test-utils,
 *                 a fresh Pinia + typed fake `window.api` reset before each test.
 */
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
    },
  },
  {
    plugins: [vue()],
    test: {
      name: 'renderer',
      environment: 'jsdom',
      include: ['tests/renderer/**/*.test.ts'],
      setupFiles: ['tests/renderer/setup.ts'],
    },
  },
])
