/**
 * Phase 0.6: experimental flags default off, unknown ids fail closed but are
 * preserved, and main enforces independently of the renderer.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/services/settingsService', () => ({ loadSettings: vi.fn() }))

import { isFeatureEnabled, FEATURE_FLAG_IDS } from '../../shared/featureFlags'
import { isFeatureEnabledMain, assertFeatureEnabled } from '../../electron/services/featureFlags'
import { loadSettings } from '../../electron/services/settingsService'

describe('isFeatureEnabled (pure)', () => {
  const known = FEATURE_FLAG_IDS[0]

  it('defaults to false when the map is missing or empty', () => {
    expect(isFeatureEnabled(undefined, known)).toBe(false)
    expect(isFeatureEnabled({}, known)).toBe(false)
  })

  it('honors an explicit true for a known flag', () => {
    expect(isFeatureEnabled({ [known]: true }, known)).toBe(true)
    expect(isFeatureEnabled({ [known]: false }, known)).toBe(false)
  })

  it('fails closed for an unknown id even when the file says true', () => {
    expect(isFeatureEnabled({ someFutureFlag: true }, 'someFutureFlag')).toBe(false)
  })

  it('treats non-true values as false', () => {
    expect(isFeatureEnabled({ [known]: 1 as unknown as boolean }, known)).toBe(false)
  })
})

describe('main enforcement', () => {
  const known = FEATURE_FLAG_IDS[0] as never

  it('reflects the stored setting', () => {
    vi.mocked(loadSettings).mockReturnValue({ experimentalFeatures: { [known]: true } } as never)
    expect(isFeatureEnabledMain(known)).toBe(true)
    vi.mocked(loadSettings).mockReturnValue({ experimentalFeatures: {} } as never)
    expect(isFeatureEnabledMain(known)).toBe(false)
  })

  it('resolves false when settings cannot be read', () => {
    vi.mocked(loadSettings).mockImplementation(() => {
      throw new Error('broken settings')
    })
    expect(isFeatureEnabledMain(known)).toBe(false)
  })

  it('assertFeatureEnabled throws a feature-disabled code when off', () => {
    vi.mocked(loadSettings).mockReturnValue({ experimentalFeatures: {} } as never)
    expect(() => assertFeatureEnabled(known)).toThrowError()
    try {
      assertFeatureEnabled(known)
    } catch (err) {
      expect((err as { code?: string }).code).toBe('feature-disabled')
    }
  })

  it('assertFeatureEnabled passes when on', () => {
    vi.mocked(loadSettings).mockReturnValue({ experimentalFeatures: { [known]: true } } as never)
    expect(() => assertFeatureEnabled(known)).not.toThrow()
  })
})
