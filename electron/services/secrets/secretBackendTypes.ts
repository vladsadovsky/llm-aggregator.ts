/**
 * Shared contracts for the secret storage chain.
 *
 * The resolution order is fixed (see `secretResolver.ts`):
 *   1. `env`          — development-only override, read-only
 *   2. `safe-storage` — Electron safeStorage-encrypted file, read/write
 *
 * Legacy plaintext `secrets.json` is deliberately NOT part of the chain; it is
 * renamed out of the way on startup by `legacyCleanup.ts`.
 */

/** API keys the app knows how to store. */
export interface AppSecrets {
  openaiApiKey: string
  anthropicApiKey: string
  azureApiKey: string
  selfHostedApiKey: string
}

export type SecretKey = keyof AppSecrets

export const SECRET_KEYS: SecretKey[] = ['openaiApiKey', 'anthropicApiKey', 'azureApiKey', 'selfHostedApiKey']

/** Which backend a resolved value came from. `none` means no source had a value. */
export type SecretSource = 'env' | 'safe-storage' | 'none'

/** Backend identifiers, i.e. every `SecretSource` that can actually hold a value. */
export type SecretBackendId = Exclude<SecretSource, 'none'>

/**
 * Error taxonomy surfaced to the UI. Codes are stable strings so the renderer can
 * map them to copy without parsing messages.
 */
export type SecretErrorCode =
  /** Prefixed env vars are set but the dev-env override is switched off in settings. */
  | 'ENV_DISABLED'
  /** Override is enabled in settings but the app is packaged, so env is ignored. */
  | 'ENV_IGNORED_PACKAGED'
  /** An env var is present but blank or whitespace-only. */
  | 'ENV_MALFORMED'
  /** OS-backed encryption is not available on this machine. */
  | 'SAFE_STORAGE_UNAVAILABLE'
  /** Linux selected the `basic_text` backend — obfuscation, not real encryption. */
  | 'SAFE_STORAGE_INSECURE_BACKEND'
  /** A legacy plaintext file was migrated into encrypted storage and purged. */
  | 'LEGACY_MIGRATED'
  /** A legacy plaintext file was found but migration could not be verified. */
  | 'LEGACY_MIGRATION_FAILED'
  /** The encrypted file exists but could not be read. */
  | 'SAFE_STORAGE_READ_FAIL'
  /** The encrypted file was read but could not be decrypted or parsed. */
  | 'SAFE_STORAGE_DECRYPT_FAIL'
  /** The encrypted file could not be written. */
  | 'SAFE_STORAGE_WRITE_FAIL'
  /** A legacy plaintext secrets.json was found and renamed aside. */
  | 'LEGACY_FILE_ORPHANED'
  /** No source produced a value for at least one key. */
  | 'NO_SECRET_AVAILABLE'

export interface SecretWarning {
  code: SecretErrorCode
  /** User-facing text. Never contains a secret value. */
  message: string
}

/**
 * One storage layer. All methods are synchronous: `safeStorage` and `process.env`
 * are both sync, which keeps `loadSecrets()` sync and leaves the 11 `getProvider()`
 * call sites untouched.
 */
export interface SecretBackend {
  readonly id: SecretBackendId
  /** Read-only backends (env) reject `save`. */
  readonly writable: boolean
  /** Whether this backend can be used at all right now. */
  isAvailable(): boolean
  /** Returns only the keys this backend actually holds. Never throws. */
  load(): { secrets: Partial<AppSecrets>; warnings: SecretWarning[] }
  /** Persists the full secret set. Only called when `writable` is true. */
  save(secrets: AppSecrets): void
}

export interface SecretResolutionResult {
  secrets: AppSecrets
  sourceByKey: Record<SecretKey, SecretSource>
  warnings: SecretWarning[]
}

/** Non-secret view of storage state, safe to hand to the renderer. */
export interface SecretKeyStatus {
  hasKey: boolean
  /** e.g. `sk-…a1b2`. Empty string when no key is stored. */
  maskedPreview: string
  source: SecretSource
  /** True when the value comes from a read-only source and cannot be edited here. */
  readOnly: boolean
}

export interface SecretsStatus {
  keys: Record<SecretKey, SecretKeyStatus>
  warnings: SecretWarning[]
  /** Which backends are usable right now, for the diagnostics row. */
  backends: Array<{ id: SecretBackendId; available: boolean; writable: boolean }>
}

/**
 * Masks a secret for display: keeps a short prefix and suffix so a user can tell
 * two keys apart without the value being recoverable.
 */
export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.length <= 8) {
    return '•'.repeat(trimmed.length)
  }
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`
}
