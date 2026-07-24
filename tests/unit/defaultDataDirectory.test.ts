import { describe, expect, it } from 'vitest'
import { win32 } from 'path'
import { getDefaultDataDirectory } from '../../electron/services/defaultDataDirectory'

describe('getDefaultDataDirectory', () => {
  it('prefers an active primary OneDrive root on Windows', () => {
    const env = {
      OneDrive: 'C:\\Users\\Ada\\OneDrive',
      USERPROFILE: 'C:\\Users\\Ada',
    }

    expect(getDefaultDataDirectory('win32', env, path => path === env.OneDrive))
      .toBe(win32.join(env.OneDrive, 'Documents', 'LLM-Aggregator'))
  })

  it('uses an active commercial OneDrive root when no primary root is available', () => {
    const env = {
      OneDriveCommercial: 'C:\\Users\\Ada\\OneDrive - Example Corp',
      USERPROFILE: 'C:\\Users\\Ada',
    }

    expect(getDefaultDataDirectory('win32', env, path => path === env.OneDriveCommercial))
      .toBe(win32.join(env.OneDriveCommercial, 'Documents', 'LLM-Aggregator'))
  })

  it('falls back to the user profile when OneDrive is absent or inactive', () => {
    const env = {
      OneDrive: 'C:\\Users\\Ada\\Missing OneDrive',
      USERPROFILE: 'C:\\Users\\Ada',
    }

    expect(getDefaultDataDirectory('win32', env, () => false))
      .toBe(win32.join(env.USERPROFILE, 'Documents', 'LLM-Aggregator'))
  })
})
