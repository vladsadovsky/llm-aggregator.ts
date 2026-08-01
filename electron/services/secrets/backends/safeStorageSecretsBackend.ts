import { existsSync, readFileSync } from 'fs'
import type {
  AppSecrets,
  SecretBackend,
  SecretWarning,
} from '../secretBackendTypes'
import { debugError } from '../../logger'
import { atomicWriteFileSync } from '../../persistence/atomicFile'

/** Bump when the on-disk envelope shape changes. */
const ENVELOPE_VERSION = 1

interface SecretsEnvelope {
  version: number
  /** Informational: which mechanism produced `ciphertext`. */
  algorithm: 'electron-safeStorage'
  /** base64 of the safeStorage-encrypted JSON payload. */
  ciphertext: string
  updatedAt: string
}

/**
 * Minimal slice of Electron's `safeStorage` that this backend needs.
 * Injected so the backend is testable without an Electron runtime.
 */
export interface SafeStorageCrypto {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
  /**
   * Linux only: which OS backend safeStorage selected. `basic_text` means the
   * payload is merely obfuscated, not encrypted, so we refuse to treat it as
   * secure storage. Optional — absent on Windows/macOS builds.
   */
  getSelectedStorageBackend?(): string
}

export interface SafeStorageBackendOptions {
  /** Absolute path to the encrypted secrets file. */
  filePath: string
  crypto: SafeStorageCrypto
  /** Injected for tests; defaults to the host platform. */
  platform?: NodeJS.Platform
}

function isEnvelope(value: unknown): value is SecretsEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<SecretsEnvelope>
  return typeof candidate.ciphertext === 'string' && typeof candidate.version === 'number'
}

/**
 * Primary read/write backend. Secrets are stored as a single JSON blob encrypted
 * with Electron's `safeStorage`, which is backed by DPAPI on Windows, the
 * Keychain on macOS, and libsecret/kwallet on Linux — so the encryption key is
 * held by the OS rather than by this app.
 *
 * Note on the file format: the migration plan specified `nonce/iv` and KDF
 * metadata fields. Those do not apply here — `safeStorage` owns key derivation
 * and IV handling internally and exposes only opaque ciphertext, so the envelope
 * records the algorithm instead of parameters we do not control.
 */
export function createSafeStorageSecretsBackend(options: SafeStorageBackendOptions): SecretBackend {
  const { filePath, crypto } = options
  const platform = options.platform ?? process.platform

  const encAvailable = (): boolean => {
    try {
      return crypto.isEncryptionAvailable()
    } catch (err) {
      debugError('safeStorageSecrets', 'isEncryptionAvailable threw:', err)
      return false
    }
  }

  /**
   * True when Linux selected the `basic_text` backend, which obfuscates rather
   * than encrypts. We must not present it as secure storage or silently save
   * real keys through it.
   */
  const isInsecureBackend = (): boolean => {
    if (platform !== 'linux' || typeof crypto.getSelectedStorageBackend !== 'function') {
      return false
    }
    try {
      return crypto.getSelectedStorageBackend() === 'basic_text'
    } catch (err) {
      debugError('safeStorageSecrets', 'getSelectedStorageBackend threw:', err)
      return false
    }
  }

  // Local rather than `this.isAvailable()` so the backend keeps working if a
  // caller destructures its methods. An insecure backend is treated as
  // unavailable for both read and write.
  const available = (): boolean => encAvailable() && !isInsecureBackend()

  return {
    id: 'safe-storage',
    writable: true,

    isAvailable: available,

    load() {
      const warnings: SecretWarning[] = []

      if (!encAvailable()) {
        warnings.push({
          code: 'SAFE_STORAGE_UNAVAILABLE',
          message: 'OS-backed secure storage is unavailable on this machine, so saved API keys cannot be read.',
        })
        return { secrets: {}, warnings }
      }

      if (isInsecureBackend()) {
        warnings.push({
          code: 'SAFE_STORAGE_INSECURE_BACKEND',
          message:
            'Your Linux session offers only basic_text storage, which does not encrypt secrets. ' +
            'Install a system keyring (GNOME Keyring or KWallet) to store API keys securely.',
        })
        return { secrets: {}, warnings }
      }

      if (!existsSync(filePath)) {
        return { secrets: {}, warnings }
      }

      let raw: string
      try {
        raw = readFileSync(filePath, 'utf-8')
      } catch (err) {
        debugError('safeStorageSecrets', 'Failed to read secrets file:', err)
        warnings.push({
          code: 'SAFE_STORAGE_READ_FAIL',
          message: 'The stored API key file could not be read. Re-enter your keys in Settings.',
        })
        return { secrets: {}, warnings }
      }

      try {
        const parsed: unknown = JSON.parse(raw)
        if (!isEnvelope(parsed)) {
          throw new Error('Unrecognized secrets envelope shape.')
        }
        const plain = crypto.decryptString(Buffer.from(parsed.ciphertext, 'base64'))
        const decoded: unknown = JSON.parse(plain)
        if (typeof decoded !== 'object' || decoded === null) {
          throw new Error('Decrypted payload was not an object.')
        }

        // Copy only known keys with string values; never trust the file's shape.
        const source = decoded as Partial<Record<keyof AppSecrets, unknown>>
        const secrets: Partial<AppSecrets> = {}
        if (typeof source.openaiApiKey === 'string' && source.openaiApiKey.trim()) {
          secrets.openaiApiKey = source.openaiApiKey.trim()
        }
        if (typeof source.anthropicApiKey === 'string' && source.anthropicApiKey.trim()) {
          secrets.anthropicApiKey = source.anthropicApiKey.trim()
        }
        return { secrets, warnings }
      } catch (err) {
        // Do not log `raw` — it is ciphertext, but the failure mode is unknown.
        debugError('safeStorageSecrets', 'Failed to decrypt secrets file:', err)
        warnings.push({
          code: 'SAFE_STORAGE_DECRYPT_FAIL',
          message: 'Stored API keys could not be decrypted. This usually means the file was copied from another machine or user account. Re-enter your keys in Settings.',
        })
        return { secrets: {}, warnings }
      }
    },

    save(secrets: AppSecrets) {
      if (!encAvailable()) {
        throw new Error('Secure storage is unavailable on this machine, so API keys cannot be saved.')
      }
      if (isInsecureBackend()) {
        throw new Error(
          'Refusing to save API keys through Linux basic_text, which does not encrypt them. ' +
            'Install a system keyring (GNOME Keyring or KWallet) first.',
        )
      }

      const envelope: SecretsEnvelope = {
        version: ENVELOPE_VERSION,
        algorithm: 'electron-safeStorage',
        ciphertext: crypto.encryptString(JSON.stringify(secrets)).toString('base64'),
        updatedAt: new Date().toISOString(),
      }

      // Atomic + last-known-good, and validate by decrypting the just-written
      // temp before promotion — a save that cannot be read back never replaces a
      // good envelope (INV-SECRET, INV-DATA).
      atomicWriteFileSync(filePath, JSON.stringify(envelope, null, 2), {
        keepLastKnownGood: true,
        validate: (written) => {
          const parsed: unknown = JSON.parse(written.toString('utf-8'))
          if (!isEnvelope(parsed)) throw new Error('Envelope shape invalid after write.')
          const plain = crypto.decryptString(Buffer.from(parsed.ciphertext, 'base64'))
          const decoded: unknown = JSON.parse(plain)
          if (typeof decoded !== 'object' || decoded === null) {
            throw new Error('Decrypted payload invalid after write.')
          }
        },
      })
    },
  }
}
