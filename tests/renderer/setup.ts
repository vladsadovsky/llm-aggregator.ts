/**
 * Renderer (jsdom) test setup — plan section 14.1.
 *
 * Before every renderer test: install a fresh active Pinia, a fresh typed fake
 * `window.api` (the same `mockApi` the browser dev build uses, so tests exercise
 * the real ElectronAPI surface), and a clean DOM/localStorage. After each test,
 * restore any spies. This keeps renderer-unit tests isolated from one another.
 */
import { beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { config } from '@vue/test-utils'
import { mockApi } from '../../src/api-mock'
import type { ElectronAPI } from '../../electron/preload'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

// Install deterministic storage without reading Node 26's experimental
// localStorage accessor, which otherwise warns and yields undefined unless the
// process was launched with --localstorage-file.
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
})

beforeEach(() => {
  setActivePinia(createPinia())
  // A shallow clone so a test spying on one method never leaks into the next.
  ;(window as unknown as { api: ElectronAPI }).api = { ...mockApi }
  window.localStorage.clear()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  config.global.plugins = []
})
