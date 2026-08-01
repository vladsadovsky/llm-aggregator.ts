import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createSafeStorageSecretsBackend,
  type SafeStorageCrypto,
} from '../../electron/services/secrets/backends/safeStorageSecretsBackend'
import { cleanupLegacyPlaintextSecrets } from '../../electron/services/secrets/legacyCleanup'

/**
 * Reversible stand-in for Electron's safeStorage. Not encryption — just enough to
 * verify the envelope round-trips and that plaintext is not written to disk.
 */
function fakeCrypto(available = true): SafeStorageCrypto {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (buf: Buffer) => {
      const raw = buf.toString('utf-8')
      if (!raw.startsWith('enc:')) {
        throw new Error('Bad ciphertext')
      }
      return raw.slice(4)
    },
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'llm-agg-secrets-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('safeStorage secrets backend', () => {
  it('round-trips secrets through the envelope', () => {
    const filePath = join(dir, 'secrets.enc.json')
    const backend = createSafeStorageSecretsBackend({ filePath, crypto: fakeCrypto() })

    backend.save({ openaiApiKey: 'sk-openai', anthropicApiKey: 'sk-anthropic' })

    expect(backend.load().secrets).toEqual({
      openaiApiKey: 'sk-openai',
      anthropicApiKey: 'sk-anthropic',
    })
  })

  it('does not write key values as readable plaintext', () => {
    const filePath = join(dir, 'secrets.enc.json')
    const backend = createSafeStorageSecretsBackend({ filePath, crypto: fakeCrypto() })

    backend.save({ openaiApiKey: 'sk-secret-value', anthropicApiKey: '' })

    const onDisk = readFileSync(filePath, 'utf-8')
    expect(onDisk).not.toContain('sk-secret-value')
    expect(JSON.parse(onDisk)).toMatchObject({ version: 1, algorithm: 'electron-safeStorage' })
  })

  it('returns no secrets and a warning when the file is corrupt', () => {
    const filePath = join(dir, 'secrets.enc.json')
    writeFileSync(filePath, 'not json at all', 'utf-8')
    const backend = createSafeStorageSecretsBackend({ filePath, crypto: fakeCrypto() })

    const { secrets, warnings } = backend.load()

    expect(secrets).toEqual({})
    expect(warnings.map(w => w.code)).toContain('SAFE_STORAGE_DECRYPT_FAIL')
  })

  it('reports unavailability instead of throwing when the OS has no secure storage', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'secrets.enc.json'),
      crypto: fakeCrypto(false),
    })

    expect(backend.isAvailable()).toBe(false)
    expect(backend.load().warnings.map(w => w.code)).toContain('SAFE_STORAGE_UNAVAILABLE')
    expect(() => backend.save({ openaiApiKey: 'x', anthropicApiKey: '' }))
      .toThrowError(/Secure storage is unavailable/)
  })

  it('ignores non-string values in a tampered payload', () => {
    const filePath = join(dir, 'secrets.enc.json')
    const crypto = fakeCrypto()
    writeFileSync(filePath, JSON.stringify({
      version: 1,
      algorithm: 'electron-safeStorage',
      ciphertext: crypto.encryptString(JSON.stringify({ openaiApiKey: 42 })).toString('base64'),
      updatedAt: new Date().toISOString(),
    }), 'utf-8')

    const backend = createSafeStorageSecretsBackend({ filePath, crypto })
    expect(backend.load().secrets).toEqual({})
  })

  it('returns nothing when no file exists yet, without warning', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'missing.enc.json'),
      crypto: fakeCrypto(),
    })

    expect(backend.load()).toEqual({ secrets: {}, warnings: [] })
  })

  it('promotes atomically — a valid envelope survives a save whose readback cannot decrypt', () => {
    const filePath = join(dir, 'secrets.enc.json')
    // First, a good save.
    createSafeStorageSecretsBackend({ filePath, crypto: fakeCrypto() }).save({
      openaiApiKey: 'sk-good',
      anthropicApiKey: '',
    })
    const before = readFileSync(filePath, 'utf-8')

    // A crypto that encrypts to something it cannot itself decrypt fails the
    // decrypt-before-promote validation, so the original envelope is untouched.
    const brokenCrypto: SafeStorageCrypto = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from('unreadable', 'utf-8'),
      decryptString: () => {
        throw new Error('cannot decrypt')
      },
    }
    expect(() =>
      createSafeStorageSecretsBackend({ filePath, crypto: brokenCrypto }).save({
        openaiApiKey: 'sk-new',
        anthropicApiKey: '',
      }),
    ).toThrow()
    expect(readFileSync(filePath, 'utf-8')).toBe(before)
  })
})

describe('Linux basic_text rejection', () => {
  function linuxCrypto(backendName: string): SafeStorageCrypto {
    return { ...fakeCrypto(), getSelectedStorageBackend: () => backendName }
  }

  it('treats basic_text as unavailable and warns instead of reading', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'secrets.enc.json'),
      crypto: linuxCrypto('basic_text'),
      platform: 'linux',
    })
    expect(backend.isAvailable()).toBe(false)
    expect(backend.load().warnings.map((w) => w.code)).toContain('SAFE_STORAGE_INSECURE_BACKEND')
  })

  it('refuses to save through basic_text', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'secrets.enc.json'),
      crypto: linuxCrypto('basic_text'),
      platform: 'linux',
    })
    expect(() => backend.save({ openaiApiKey: 'sk', anthropicApiKey: '' })).toThrow(/basic_text/)
  })

  it('accepts a real keyring backend on Linux', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'secrets.enc.json'),
      crypto: linuxCrypto('gnome_libsecret'),
      platform: 'linux',
    })
    expect(backend.isAvailable()).toBe(true)
    backend.save({ openaiApiKey: 'sk-keyring', anthropicApiKey: '' })
    expect(backend.load().secrets.openaiApiKey).toBe('sk-keyring')
  })

  it('ignores the selected backend on non-Linux platforms', () => {
    const backend = createSafeStorageSecretsBackend({
      filePath: join(dir, 'secrets.enc.json'),
      crypto: linuxCrypto('basic_text'),
      platform: 'win32',
    })
    expect(backend.isAvailable()).toBe(true)
  })
})

describe('legacy plaintext cleanup', () => {
  it('renames a legacy secrets.json aside and warns about the cleartext copy', () => {
    writeFileSync(join(dir, 'secrets.json'), '{"openaiApiKey":"sk-legacy"}', 'utf-8')

    const result = cleanupLegacyPlaintextSecrets(dir)

    expect(result.renamed).toBe(true)
    expect(result.orphanedPath).toBe(join(dir, 'secrets.json.orphaned.bak'))
    expect(result.warnings.map(w => w.code)).toContain('LEGACY_FILE_ORPHANED')
  })

  it('is a no-op when there is nothing to move', () => {
    const result = cleanupLegacyPlaintextSecrets(dir)

    expect(result.renamed).toBe(false)
    expect(result.orphanedPath).toBeNull()
    expect(result.warnings).toEqual([])
  })

  it('keeps warning while an orphaned backup still exists', () => {
    writeFileSync(join(dir, 'secrets.json'), '{}', 'utf-8')
    cleanupLegacyPlaintextSecrets(dir)

    // Second run: nothing left to rename, but the cleartext backup is still there.
    const second = cleanupLegacyPlaintextSecrets(dir)

    expect(second.renamed).toBe(false)
    expect(second.warnings.map(w => w.code)).toContain('LEGACY_FILE_ORPHANED')
  })

  it('does not clobber an existing backup when a legacy file reappears', () => {
    writeFileSync(join(dir, 'secrets.json'), '{"openaiApiKey":"first"}', 'utf-8')
    cleanupLegacyPlaintextSecrets(dir)
    writeFileSync(join(dir, 'secrets.json'), '{"openaiApiKey":"second"}', 'utf-8')

    cleanupLegacyPlaintextSecrets(dir)

    expect(readFileSync(join(dir, 'secrets.json.orphaned.bak'), 'utf-8')).toContain('first')
  })
})
