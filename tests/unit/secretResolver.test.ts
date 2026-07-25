import { describe, expect, it } from 'vitest'
import { createEnvSecretsBackend } from '../../electron/services/secrets/backends/envSecretsBackend'
import {
  buildSecretsStatus,
  findWriteTarget,
  resolveSecrets,
  saveSecretsToChain,
} from '../../electron/services/secrets/secretResolver'
import {
  maskSecret,
  type AppSecrets,
  type SecretBackend,
} from '../../electron/services/secrets/secretBackendTypes'

/** In-memory stand-in for the safeStorage backend. */
function fakeWritableBackend(
  initial: Partial<AppSecrets> = {},
  available = true,
): SecretBackend & { stored: Partial<AppSecrets> } {
  const backend = {
    stored: { ...initial },
    id: 'safe-storage' as const,
    writable: true,
    isAvailable: () => available,
    load() {
      return { secrets: { ...backend.stored }, warnings: [] }
    },
    save(secrets: AppSecrets) {
      backend.stored = { ...secrets }
    },
  }
  return backend
}

function envBackend(env: NodeJS.ProcessEnv, allow: boolean, isPackaged = false) {
  return createEnvSecretsBackend({ env, isPackaged, allowDevEnvSecrets: allow })
}

describe('resolveSecrets precedence', () => {
  it('prefers env over stored values when the override is enabled in a dev build', () => {
    const chain = [
      envBackend({ LLM_AGG_OPENAI_API_KEY: 'from-env' }, true),
      fakeWritableBackend({ openaiApiKey: 'from-storage' }),
    ]

    const result = resolveSecrets(chain)

    expect(result.secrets.openaiApiKey).toBe('from-env')
    expect(result.sourceByKey.openaiApiKey).toBe('env')
  })

  it('falls through to stored values for keys the env does not supply', () => {
    const chain = [
      envBackend({ LLM_AGG_OPENAI_API_KEY: 'from-env' }, true),
      fakeWritableBackend({ openaiApiKey: 'ignored', anthropicApiKey: 'stored-anthropic' }),
    ]

    const result = resolveSecrets(chain)

    expect(result.secrets.anthropicApiKey).toBe('stored-anthropic')
    expect(result.sourceByKey.anthropicApiKey).toBe('safe-storage')
  })

  it('ignores env entirely when the override is disabled, and says so', () => {
    const chain = [
      envBackend({ LLM_AGG_OPENAI_API_KEY: 'from-env' }, false),
      fakeWritableBackend({ openaiApiKey: 'from-storage' }),
    ]

    const result = resolveSecrets(chain)

    expect(result.secrets.openaiApiKey).toBe('from-storage')
    expect(result.warnings.map(w => w.code)).toContain('ENV_DISABLED')
  })

  it('ignores env in a packaged build even when the setting is on', () => {
    const chain = [
      envBackend({ LLM_AGG_OPENAI_API_KEY: 'from-env' }, true, true),
      fakeWritableBackend({ openaiApiKey: 'from-storage' }),
    ]

    const result = resolveSecrets(chain)

    expect(result.secrets.openaiApiKey).toBe('from-storage')
    expect(result.warnings.map(w => w.code)).toContain('ENV_IGNORED_PACKAGED')
  })

  it('stays silent about env when no prefixed variables are set', () => {
    const result = resolveSecrets([
      envBackend({}, false),
      fakeWritableBackend({ openaiApiKey: 'from-storage' }),
    ])

    expect(result.warnings.map(w => w.code)).not.toContain('ENV_DISABLED')
  })

  it('treats a blank env value as malformed rather than as a key', () => {
    const result = resolveSecrets([
      envBackend({ LLM_AGG_OPENAI_API_KEY: '   ' }, true),
      fakeWritableBackend({ openaiApiKey: 'from-storage' }),
    ])

    expect(result.secrets.openaiApiKey).toBe('from-storage')
    expect(result.warnings.map(w => w.code)).toContain('ENV_MALFORMED')
  })

  it('reports NO_SECRET_AVAILABLE when nothing supplies a key', () => {
    const result = resolveSecrets([envBackend({}, true), fakeWritableBackend()])

    expect(result.sourceByKey.openaiApiKey).toBe('none')
    expect(result.warnings.map(w => w.code)).toContain('NO_SECRET_AVAILABLE')
  })
})

describe('saveSecretsToChain', () => {
  it('leaves omitted keys untouched', () => {
    const writable = fakeWritableBackend({ openaiApiKey: 'old-openai', anthropicApiKey: 'old-anthropic' })

    saveSecretsToChain([envBackend({}, false), writable], { openaiApiKey: 'new-openai' })

    expect(writable.stored.openaiApiKey).toBe('new-openai')
    expect(writable.stored.anthropicApiKey).toBe('old-anthropic')
  })

  it('never persists an env-supplied value into storage', () => {
    const writable = fakeWritableBackend({ openaiApiKey: 'stored-openai' })
    const chain = [envBackend({ LLM_AGG_ANTHROPIC_API_KEY: 'env-anthropic' }, true), writable]

    // User edits only the OpenAI field; the env-sourced Anthropic key must not leak in.
    saveSecretsToChain(chain, { openaiApiKey: 'typed-openai' })

    expect(writable.stored.openaiApiKey).toBe('typed-openai')
    expect(writable.stored.anthropicApiKey).toBe('')
  })

  it('trims stored values', () => {
    const writable = fakeWritableBackend()
    saveSecretsToChain([writable], { openaiApiKey: '  spaced-key  ' })
    expect(writable.stored.openaiApiKey).toBe('spaced-key')
  })

  it('throws a user-facing error when no writable backend is available', () => {
    const chain = [envBackend({}, false), fakeWritableBackend({}, false)]

    expect(() => saveSecretsToChain(chain, { openaiApiKey: 'x' }))
      .toThrowError(/No writable secret storage/)
  })

  it('does not treat the read-only env backend as a write target', () => {
    expect(findWriteTarget([envBackend({}, true)])).toBeNull()
  })
})

describe('buildSecretsStatus', () => {
  it('exposes presence and provenance without the value', () => {
    const chain = [envBackend({}, false), fakeWritableBackend({ openaiApiKey: 'sk-test-abcd1234' })]
    const status = buildSecretsStatus(chain, resolveSecrets(chain))

    expect(status.keys.openaiApiKey.hasKey).toBe(true)
    expect(status.keys.openaiApiKey.source).toBe('safe-storage')
    expect(status.keys.openaiApiKey.readOnly).toBe(false)
    expect(JSON.stringify(status)).not.toContain('sk-test-abcd1234')
  })

  it('marks env-sourced keys read-only so the UI can disable editing', () => {
    const chain = [envBackend({ LLM_AGG_OPENAI_API_KEY: 'env-key-value' }, true), fakeWritableBackend()]
    const status = buildSecretsStatus(chain, resolveSecrets(chain))

    expect(status.keys.openaiApiKey.readOnly).toBe(true)
    expect(status.keys.anthropicApiKey.readOnly).toBe(false)
  })

  it('reports backend availability for the diagnostics row', () => {
    const chain = [envBackend({}, false), fakeWritableBackend({}, false)]
    const status = buildSecretsStatus(chain, resolveSecrets(chain))

    expect(status.backends).toEqual([
      { id: 'env', available: false, writable: false },
      { id: 'safe-storage', available: false, writable: true },
    ])
  })
})

describe('maskSecret', () => {
  it('keeps a recognizable prefix and suffix for a normal key', () => {
    expect(maskSecret('sk-proj-abcdefghijkl')).toBe('sk-…ijkl')
  })

  it('fully masks short values so nothing meaningful is exposed', () => {
    expect(maskSecret('abc123')).toBe('••••••')
  })

  it('returns empty string for blank input', () => {
    expect(maskSecret('   ')).toBe('')
  })
})
