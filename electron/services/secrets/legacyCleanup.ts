import { existsSync, renameSync } from 'fs'
import { join } from 'path'
import type { SecretWarning } from './secretBackendTypes'
import { debugError, debugLog } from './../logger'

export const LEGACY_SECRETS_FILENAME = 'secrets.json'
export const ORPHANED_SECRETS_SUFFIX = '.orphaned.bak'

export interface LegacyCleanupResult {
  /** True when this run performed the rename. */
  renamed: boolean
  /** Absolute path of the orphaned backup, when one exists on disk. */
  orphanedPath: string | null
  warnings: SecretWarning[]
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * Moves any legacy plaintext `secrets.json` aside.
 *
 * The resolver never reads legacy plaintext, so leaving the file in place would
 * strand live API keys in cleartext with nothing to ever clean them up. Renaming
 * rather than deleting keeps the value recoverable — but the backup is still
 * cleartext on disk, which is why a warning is surfaced for as long as it exists.
 *
 * Idempotent: after the first run there is no `secrets.json` left to move.
 */
export function cleanupLegacyPlaintextSecrets(userDataDir: string): LegacyCleanupResult {
  const legacyPath = join(userDataDir, LEGACY_SECRETS_FILENAME)
  const defaultOrphanPath = `${legacyPath}${ORPHANED_SECRETS_SUFFIX}`
  const warnings: SecretWarning[] = []

  let renamed = false
  if (existsSync(legacyPath)) {
    // Never clobber an existing backup — a second one means the user re-created
    // the legacy file, and both copies may hold different keys.
    const target = existsSync(defaultOrphanPath)
      ? `${legacyPath}.${timestampSuffix()}${ORPHANED_SECRETS_SUFFIX}`
      : defaultOrphanPath

    try {
      renameSync(legacyPath, target)
      renamed = true
      debugLog('legacyCleanup', 'Renamed legacy plaintext secrets file to:', target)
    } catch (err) {
      debugError('legacyCleanup', 'Failed to rename legacy secrets file:', err)
      warnings.push({
        code: 'LEGACY_FILE_ORPHANED',
        message: `A legacy plaintext key file at ${legacyPath} could not be renamed. It is no longer used, but still contains keys in clear text — delete it manually.`,
      })
      return { renamed: false, orphanedPath: legacyPath, warnings }
    }
  }

  // Warn for as long as a cleartext backup exists, not just on the run that
  // created it — otherwise the notice is missed unless Settings happens to be
  // open at the right moment.
  const orphanedPath = existsSync(defaultOrphanPath) ? defaultOrphanPath : null
  if (orphanedPath) {
    warnings.push({
      code: 'LEGACY_FILE_ORPHANED',
      message: `Your previously stored API keys are no longer read. The old file was renamed to ${orphanedPath} and still contains keys in clear text — delete it once you have re-entered your keys in Settings.`,
    })
  }

  return { renamed, orphanedPath, warnings }
}
