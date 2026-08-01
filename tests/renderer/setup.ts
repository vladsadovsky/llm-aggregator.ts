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
