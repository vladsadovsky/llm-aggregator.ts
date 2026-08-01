/**
 * INV-SECRET: legacy plaintext is migrated into encrypted storage and purged only
 * after a verified round-trip; a stored value is never overwritten; on failure or
 * unavailability the plaintext is left untouched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { migrateLegacyPlaintextSecrets } from '../../electron/services/secrets/legacyMigration'
import type { AppSecrets, SecretBackend } from '../../electron/services/secrets/secretBackendTypes'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'legacy-mig-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** In-memory encrypted-backend stand-in. */
function fakeBackend(initial: Partial<AppSecrets> = {}, available = true): SecretBackend {
  let stored: Partial<AppSecrets> = { ...initial }
  return {
    id: 'safe-storage',
    writable: true,
    isAvailable: () => available,
    load: () => ({ secrets: { ...stored }, warnings: [] }),
    save: (secrets: AppSecrets) => {
      stored = { ...secrets }
    },
  }
}

const legacyPath = () => join(dir, 'secrets.json')

describe('migrateLegacyPlaintextSecrets', () => {
  it('is a no-op when there is no legacy file', () => {
    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend: fakeBackend() })
    expect(result.migrated).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('migrates a legacy key into the backend and purges the plaintext', () => {
    writeFileSync(legacyPath(), JSON.stringify({ openaiApiKey: 'sk-legacy' }), 'utf-8')
    const backend = fakeBackend()

    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    expect(result.migrated).toBe(true)
    expect(backend.load().secrets.openaiApiKey).toBe('sk-legacy')
    expect(existsSync(legacyPath())).toBe(false)
    expect(result.warnings.map((w) => w.code)).toContain('LEGACY_MIGRATED')
  })

  it('never overwrites a valid stored value, but fills a missing one', () => {
    writeFileSync(
      legacyPath(),
      JSON.stringify({ openaiApiKey: 'sk-legacy', anthropicApiKey: 'sk-legacy-a' }),
      'utf-8',
    )
    const backend = fakeBackend({ openaiApiKey: 'sk-stored' })

    migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    const secrets = backend.load().secrets
    expect(secrets.openaiApiKey).toBe('sk-stored') // stored wins
    expect(secrets.anthropicApiKey).toBe('sk-legacy-a') // missing filled from legacy
    expect(existsSync(legacyPath())).toBe(false)
  })

  it('leaves the plaintext untouched when secure storage is unavailable', () => {
    writeFileSync(legacyPath(), JSON.stringify({ openaiApiKey: 'sk-legacy' }), 'utf-8')
    const backend = fakeBackend({}, false)

    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    expect(result.migrated).toBe(false)
    expect(existsSync(legacyPath())).toBe(true)
    expect(result.warnings.map((w) => w.code)).toContain('LEGACY_FILE_ORPHANED')
  })

  it('leaves an unparseable file in place rather than deleting unknown data', () => {
    writeFileSync(legacyPath(), '{not valid json', 'utf-8')
    const backend = fakeBackend()

    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    expect(result.migrated).toBe(false)
    expect(existsSync(legacyPath())).toBe(true)
    expect(result.warnings.map((w) => w.code)).toContain('LEGACY_FILE_ORPHANED')
  })

  it('leaves the plaintext and warns when verification fails', () => {
    writeFileSync(legacyPath(), JSON.stringify({ openaiApiKey: 'sk-legacy' }), 'utf-8')
    // A backend that accepts a save but reloads nothing → fingerprint mismatch.
    const lying: SecretBackend = {
      id: 'safe-storage',
      writable: true,
      isAvailable: () => true,
      load: () => ({ secrets: {}, warnings: [] }),
      save: () => {},
    }

    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend: lying })

    expect(result.migrated).toBe(false)
    expect(existsSync(legacyPath())).toBe(true)
    expect(result.warnings.map((w) => w.code)).toContain('LEGACY_MIGRATION_FAILED')
  })

  it('is idempotent — a second run finds nothing to do', () => {
    writeFileSync(legacyPath(), JSON.stringify({ openaiApiKey: 'sk-legacy' }), 'utf-8')
    const backend = fakeBackend()

    migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })
    const second = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    expect(second.migrated).toBe(false)
    expect(second.warnings).toEqual([])
  })

  it('also migrates and purges prior .orphaned.bak copies', () => {
    writeFileSync(join(dir, 'secrets.json.orphaned.bak'), JSON.stringify({ openaiApiKey: 'sk-old' }), 'utf-8')
    const backend = fakeBackend()

    const result = migrateLegacyPlaintextSecrets({ userDataDir: dir, backend })

    expect(result.migrated).toBe(true)
    expect(backend.load().secrets.openaiApiKey).toBe('sk-old')
    expect(existsSync(join(dir, 'secrets.json.orphaned.bak'))).toBe(false)
  })
})
