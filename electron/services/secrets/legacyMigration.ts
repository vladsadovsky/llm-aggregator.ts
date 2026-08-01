/**
 * Verified migration of legacy plaintext secrets into encrypted storage
 * (`INV-SECRET`, Secrets V1 Step 6).
 *
 * Replaces the rename-only sweep: rather than orphaning `secrets.json` as
 * cleartext forever, this reads the known keys, merges them into the encrypted
 * backend WITHOUT overwriting a valid stored value, persists, reloads and
 * compares keyed fingerprints, and only then unlinks the plaintext. If secure
 * storage is unavailable or verification fails, the plaintext is left untouched
 * and a warning is surfaced — a key is never deleted before it is provably
 * recoverable from encrypted storage.
 *
 * Filesystem deletion is best-effort and cannot guarantee physical erasure on
 * SSDs or in cloud-sync history; the surfaced message says so.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { SECRET_KEYS, type AppSecrets, type SecretBackend, type SecretKey, type SecretWarning } from './secretBackendTypes'
import { LEGACY_SECRETS_FILENAME, ORPHANED_SECRETS_SUFFIX } from './legacyCleanup'
import { debugError, debugLog } from '../logger'

export interface LegacyMigrationIo {
  existsSync(p: string): boolean
  readFileSync(p: string): string
  readdirSync(p: string): string[]
  unlinkSync(p: string): void
}

const defaultIo: LegacyMigrationIo = {
  existsSync,
  readFileSync: (p) => readFileSync(p, 'utf-8'),
  readdirSync,
  unlinkSync,
}

export interface LegacyMigrationResult {
  migrated: boolean
  purgedFiles: string[]
  warnings: SecretWarning[]
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Locate the legacy plaintext file and any prior `.orphaned.bak` copies. */
function findLegacyFiles(userDataDir: string, io: LegacyMigrationIo): string[] {
  const found: string[] = []
  const primary = join(userDataDir, LEGACY_SECRETS_FILENAME)
  if (io.existsSync(primary)) found.push(primary)
  try {
    for (const name of io.readdirSync(userDataDir)) {
      if (name.startsWith(LEGACY_SECRETS_FILENAME) && name.endsWith(ORPHANED_SECRETS_SUFFIX)) {
        found.push(join(userDataDir, name))
      }
    }
  } catch (err) {
    debugError('legacyMigration', 'readdir failed:', err)
  }
  return found
}

/** Parse only known string keys from a legacy plaintext file. Never throws. */
function parseLegacyFile(path: string, io: LegacyMigrationIo): Partial<AppSecrets> {
  try {
    const parsed: unknown = JSON.parse(io.readFileSync(path))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const source = parsed as Partial<Record<SecretKey, unknown>>
    const out: Partial<AppSecrets> = {}
    for (const key of SECRET_KEYS) {
      const v = source[key]
      // Bound the value size so a hostile/huge file cannot be pulled into memory.
      if (typeof v === 'string' && v.trim() && v.length <= 1024) out[key] = v.trim()
    }
    return out
  } catch (err) {
    debugError('legacyMigration', 'parse failed for a legacy file:', err)
    return {}
  }
}

export interface MigrateOptions {
  userDataDir: string
  /** The writable encrypted backend (safe-storage). */
  backend: SecretBackend
  io?: LegacyMigrationIo
}

export function migrateLegacyPlaintextSecrets(options: MigrateOptions): LegacyMigrationResult {
  const io = options.io ?? defaultIo
  const { userDataDir, backend } = options
  const warnings: SecretWarning[] = []

  const legacyFiles = findLegacyFiles(userDataDir, io)
  if (legacyFiles.length === 0) {
    return { migrated: false, purgedFiles: [], warnings }
  }

  // Secure storage must be usable before we touch anything (Linux basic_text /
  // unavailable → leave plaintext untouched, warn).
  if (!backend.isAvailable()) {
    warnings.push({
      code: 'LEGACY_FILE_ORPHANED',
      message:
        'A legacy plaintext key file was found but secure storage is unavailable, so it cannot be ' +
        'migrated. It still contains keys in clear text — delete it manually once secure storage works.',
    })
    return { migrated: false, purgedFiles: [], warnings }
  }

  // Gather legacy values (first non-empty per key across the found files).
  const legacyValues: Partial<AppSecrets> = {}
  for (const file of legacyFiles) {
    const parsed = parseLegacyFile(file, io)
    for (const key of SECRET_KEYS) {
      if (!legacyValues[key] && parsed[key]) legacyValues[key] = parsed[key]
    }
  }

  // Merge base = the backend's own stored values; never overwrite a valid stored
  // value with a legacy one.
  const stored = backend.load().secrets
  const merged: AppSecrets = { openaiApiKey: '', anthropicApiKey: '', ...stored }
  const intended: Partial<Record<SecretKey, string>> = {}
  for (const key of SECRET_KEYS) {
    if (merged[key]) {
      intended[key] = merged[key]
    } else if (legacyValues[key]) {
      merged[key] = legacyValues[key] as string
      intended[key] = merged[key]
    }
  }

  // Nothing verifiable to persist (empty or unparseable file, and nothing stored)
  // — do not delete a file whose contents we could not understand.
  if ((Object.keys(intended) as SecretKey[]).length === 0) {
    warnings.push({
      code: 'LEGACY_FILE_ORPHANED',
      message:
        'A legacy plaintext key file was found but no readable keys could be extracted from it. It was ' +
        'left in place — delete it manually if it is no longer needed.',
    })
    return { migrated: false, purgedFiles: [], warnings }
  }

  // Persist (atomic + decrypt-before-promote inside the backend), then reload and
  // verify by fingerprint before deleting any plaintext.
  try {
    backend.save(merged)
  } catch (err) {
    debugError('legacyMigration', 'encrypted save failed during migration:', err)
    warnings.push({
      code: 'LEGACY_MIGRATION_FAILED',
      message: 'A legacy plaintext key file could not be migrated to secure storage. It was left in place.',
    })
    return { migrated: false, purgedFiles: [], warnings }
  }

  const reloaded = backend.load().secrets
  const verified = (Object.keys(intended) as SecretKey[]).every(
    (key) => reloaded[key] && fingerprint(reloaded[key]) === fingerprint(intended[key] as string),
  )

  if (!verified) {
    warnings.push({
      code: 'LEGACY_MIGRATION_FAILED',
      message:
        'A legacy plaintext key file could not be verified in secure storage after migration, so it was ' +
        'left in place. Re-enter your keys in Settings, then delete the old file manually.',
    })
    return { migrated: false, purgedFiles: [], warnings }
  }

  // Verified: purge the plaintext (best-effort).
  const purgedFiles: string[] = []
  for (const file of legacyFiles) {
    try {
      io.unlinkSync(file)
      purgedFiles.push(file)
    } catch (err) {
      debugError('legacyMigration', 'failed to unlink a migrated legacy file:', err)
    }
  }

  debugLog('legacyMigration', 'migrated legacy secrets; purged', purgedFiles.length, 'file(s)')
  warnings.push({
    code: 'LEGACY_MIGRATED',
    message:
      'Your previously stored API keys were migrated into encrypted storage and the plaintext file was ' +
      'removed. Note: file deletion cannot guarantee erasure from SSD wear-leveling or cloud-sync history.',
  })

  return { migrated: true, purgedFiles, warnings }
}
