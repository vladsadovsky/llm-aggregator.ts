/**
 * P0-H (main core): draft validation, optimistic-revision apply, coherent
 * commit with compensating rollback, and probe-only directory validation.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  settingsRevision,
  validateSettings,
  validateDataDirectory,
  applyDraft,
  type ValidateDirStatus,
  type DirValidationDeps,
  type ApplyDraftDeps,
} from '../../electron/services/settingsDraftService'
import type { AppSettings } from '../../electron/services/settingsService'

function settings(over: Partial<AppSettings> = {}): AppSettings {
  return {
    dataDirectory: '/data',
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
    lensEnabled: false,
    tagEnforcement: 'warn',
    tagSoftLimit: 50,
    tagHardLimit: 100,
    allowDevEnvSecrets: false,
    experimentalFeatures: {},
    ...over,
  }
}

describe('settingsRevision', () => {
  it('is stable regardless of key order', () => {
    const a = settings()
    const b = { experimentalFeatures: {}, ...a }
    expect(settingsRevision(a)).toBe(settingsRevision(b))
  })
  it('changes when any field changes', () => {
    expect(settingsRevision(settings())).not.toBe(settingsRevision(settings({ llmModel: 'gpt-5' })))
  })
})

describe('validateSettings', () => {
  it('accepts a valid completion provider + model', () => {
    expect(validateSettings(settings())).toEqual({ ok: true })
  })
  it('rejects an unknown provider', () => {
    expect(validateSettings(settings({ llmProvider: 'mystery' }))).toMatchObject({ reason: 'unknown-provider' })
  })
  it('rejects a missing model', () => {
    expect(validateSettings(settings({ llmModel: '  ' }))).toMatchObject({ reason: 'missing-model' })
  })
  it('rejects soft > hard tag limits', () => {
    expect(validateSettings(settings({ tagSoftLimit: 200 }))).toMatchObject({ reason: 'tag-limits' })
  })
  it('rejects an empty data directory', () => {
    expect(validateSettings(settings({ dataDirectory: '' }))).toMatchObject({ reason: 'missing-data-directory' })
  })
})

describe('validateDataDirectory (probe only)', () => {
  function deps(over: Partial<DirValidationDeps> = {}): DirValidationDeps {
    return {
      isAbsolute: () => true,
      exists: () => true,
      isDirectory: () => true,
      canWrite: () => true,
      summarize: () => ({ pairs: 3, threads: 1 }),
      ...over,
    }
  }
  const cases: Array<[string, Partial<DirValidationDeps>, ValidateDirStatus]> = [
    ['ok', {}, 'ok'],
    ['not-found', { exists: () => false }, 'not-found'],
    ['not-a-directory', { isDirectory: () => false }, 'not-a-directory'],
    ['not-writable', { canWrite: () => false }, 'not-writable'],
    ['unsafe (relative)', { isAbsolute: () => false }, 'unsafe-path'],
  ]
  it.each(cases)('%s', (_label, over, expected) => {
    expect(validateDataDirectory('/some/dir', deps(over)).status).toBe(expected)
  })

  it('rejects a path with a NUL byte as unsafe', () => {
    expect(validateDataDirectory('/bad\0path', deps()).status).toBe('unsafe-path')
  })

  it('returns an archive summary on success and never activates it', () => {
    const summarize = vi.fn(() => ({ pairs: 9, threads: 2 }))
    const res = validateDataDirectory('/dir', deps({ summarize }))
    expect(res).toEqual({ status: 'ok', summary: { pairs: 9, threads: 2 } })
  })
})

describe('applyDraft', () => {
  function deps(current: AppSettings, over: Partial<ApplyDraftDeps> = {}): ApplyDraftDeps & {
    savedSettings: AppSettings[]
    savedSecrets: unknown[]
  } {
    const savedSettings: AppSettings[] = []
    const savedSecrets: unknown[] = []
    return {
      loadSettings: () => current,
      saveSettings: (s) => {
        savedSettings.push(s)
      },
      saveSecrets: (u) => {
        savedSecrets.push(u)
      },
      savedSettings,
      savedSecrets,
      ...over,
    }
  }

  it('applies settings + secrets when the revision matches', () => {
    const current = settings()
    const d = deps(current)
    const next = settings({ llmModel: 'gpt-5' })
    const res = applyDraft(
      { settings: next, secretUpdates: { openaiApiKey: 'sk-x' }, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res.status).toBe('applied')
    expect(d.savedSettings).toEqual([next])
    expect(d.savedSecrets).toEqual([{ openaiApiKey: 'sk-x' }])
  })

  it('does not touch secrets when none were edited', () => {
    const current = settings()
    const d = deps(current)
    applyDraft({ settings: settings({ lensEnabled: true }), secretUpdates: {}, expectedRevision: settingsRevision(current) }, d)
    expect(d.savedSecrets).toEqual([])
  })

  it('rejects a stale revision without writing', () => {
    const current = settings()
    const d = deps(current)
    const res = applyDraft(
      { settings: settings({ llmModel: 'x' }), secretUpdates: {}, expectedRevision: 'stale' },
      d,
    )
    expect(res.status).toBe('stale-revision')
    expect(res.revision).toBe(settingsRevision(current))
    expect(d.savedSettings).toEqual([])
  })

  it('rejects invalid settings without writing', () => {
    const current = settings()
    const d = deps(current)
    const res = applyDraft(
      { settings: settings({ llmProvider: 'mystery' }), secretUpdates: {}, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res).toMatchObject({ status: 'invalid', reason: 'unknown-provider' })
    expect(d.savedSettings).toEqual([])
  })

  it('rejects an unknown secret field', () => {
    const current = settings()
    const d = deps(current)
    const res = applyDraft(
      { settings: current, secretUpdates: { evilKey: 'x' } as never, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res).toMatchObject({ status: 'invalid', reason: 'unknown-secret-field' })
  })

  it('rolls settings back when the secrets write fails', () => {
    const current = settings()
    const saved: AppSettings[] = []
    const d: ApplyDraftDeps = {
      loadSettings: () => current,
      saveSettings: (s) => {
        saved.push(s)
      },
      saveSecrets: () => {
        throw new Error('safeStorage down')
      },
    }
    const next = settings({ llmModel: 'gpt-5' })
    const res = applyDraft(
      { settings: next, secretUpdates: { openaiApiKey: 'sk' }, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res).toMatchObject({ status: 'write-failed', reason: 'secrets' })
    // wrote next, then restored prior
    expect(saved).toEqual([next, current])
  })

  it('reports needs-repair when the rollback itself fails', () => {
    const current = settings()
    let call = 0
    const d: ApplyDraftDeps = {
      loadSettings: () => current,
      saveSettings: () => {
        call += 1
        if (call === 2) throw new Error('rollback write failed') // the restore
      },
      saveSecrets: () => {
        throw new Error('secrets failed')
      },
    }
    const res = applyDraft(
      { settings: settings({ llmModel: 'z' }), secretUpdates: { openaiApiKey: 'sk' }, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res).toMatchObject({ status: 'needs-repair', reason: 'rollback-failed' })
  })

  it('reports write-failed when the settings write fails (nothing to roll back)', () => {
    const current = settings()
    const d: ApplyDraftDeps = {
      loadSettings: () => current,
      saveSettings: () => {
        throw new Error('disk full')
      },
      saveSecrets: () => {},
    }
    const res = applyDraft(
      { settings: settings({ llmModel: 'z' }), secretUpdates: {}, expectedRevision: settingsRevision(current) },
      d,
    )
    expect(res).toMatchObject({ status: 'write-failed', reason: 'settings' })
  })
})
