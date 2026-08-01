import { join } from 'path'
import { app, safeStorage } from 'electron'
import { loadSettings } from './settingsService'
import { debugError, debugLog } from './logger'
import { createEnvSecretsBackend } from './secrets/backends/envSecretsBackend'
import { createSafeStorageSecretsBackend } from './secrets/backends/safeStorageSecretsBackend'
import { migrateLegacyPlaintextSecrets, type LegacyMigrationResult } from './secrets/legacyMigration'
import {
  buildSecretsStatus,
  findWriteTarget,
  resolveSecrets,
  saveSecretsToChain,
} from './secrets/secretResolver'
import type {
  AppSecrets,
  SecretBackend,
  SecretWarning,
  SecretsStatus,
} from './secrets/secretBackendTypes'

export type { AppSecrets, SecretsStatus, SecretWarning }
export { devEnvSecretVarNames } from './secrets/backends/envSecretsBackend'

const ENCRYPTED_SECRETS_FILENAME = 'secrets.enc.json'

/**
 * Result of the one-time legacy migration, cached for the process lifetime so the
 * outcome warning survives past the run that performed it.
 */
let legacyMigration: LegacyMigrationResult | null = null

function buildSafeStorageBackend(): SecretBackend {
  return createSafeStorageSecretsBackend({
    filePath: join(app.getPath('userData'), ENCRYPTED_SECRETS_FILENAME),
    crypto: safeStorage,
  })
}

/**
 * Migrates any legacy plaintext `secrets.json` into encrypted storage and purges
 * it only after a verified round-trip. Call once during app startup, before the
 * first secrets read.
 */
export function initSecretsStorage(): void {
  if (legacyMigration) {
    return
  }
  legacyMigration = migrateLegacyPlaintextSecrets({
    userDataDir: app.getPath('userData'),
    backend: buildSafeStorageBackend(),
  })
  debugLog('secretsService', 'Legacy secrets migration complete. Migrated:', legacyMigration.migrated)
}

function legacyWarnings(): SecretWarning[] {
  // Startup wiring should have called `initSecretsStorage`, but resolve lazily so
  // a missed call degrades to a late migration rather than a silent skip.
  if (!legacyMigration) {
    initSecretsStorage()
  }
  return legacyMigration?.warnings ?? []
}

/**
 * Builds the resolution chain in precedence order.
 *
 * Rebuilt on each call rather than cached: `allowDevEnvSecrets` and the
 * environment can both change between calls, and the cost is negligible.
 */
function buildChain(): SecretBackend[] {
  let allowDevEnvSecrets = false
  try {
    allowDevEnvSecrets = loadSettings().allowDevEnvSecrets === true
  } catch (err) {
    // A broken settings file must not take down secret resolution.
    debugError('secretsService', 'Failed to read settings for env override flag:', err)
  }

  return [
    createEnvSecretsBackend({
      env: process.env,
      isPackaged: app.isPackaged,
      allowDevEnvSecrets,
    }),
    createSafeStorageSecretsBackend({
      filePath: join(app.getPath('userData'), ENCRYPTED_SECRETS_FILENAME),
      crypto: safeStorage,
    }),
  ]
}

/**
 * Resolved secret values for main-process consumers (`getProvider`, model
 * catalog). Synchronous, so existing call sites are unaffected.
 *
 * Never expose the return value to the renderer — use `getSecretsStatus()`.
 */
export function loadSecrets(): AppSecrets {
  return resolveSecrets(buildChain(), legacyWarnings()).secrets
}

/** Non-secret storage state for the renderer: presence, masked preview, provenance. */
export function getSecretsStatus(): SecretsStatus {
  const chain = buildChain()
  return buildSecretsStatus(chain, resolveSecrets(chain, legacyWarnings()))
}

/**
 * Persists only the provided keys. Omitted keys keep their stored value, which is
 * what lets the Settings dialog send just the fields the user actually edited.
 */
export function saveSecrets(updates: Partial<AppSecrets>): void {
  try {
    const { writeTarget } = saveSecretsToChain(buildChain(), updates)
    debugLog('secretsService', 'Secrets written to backend:', writeTarget)
  } catch (err) {
    debugError('secretsService', 'Failed to save secrets:', err)
    throw err instanceof Error
      ? err
      : new Error('API keys could not be saved.')
  }
}

/** Re-probes backend availability; backs the "Re-check secure storage" action. */
export function recheckSecretsStorage(): SecretsStatus {
  const chain = buildChain()
  const writable = findWriteTarget(chain)
  debugLog('secretsService', 'Storage re-check. Writable backend:', writable?.id ?? 'none')
  return buildSecretsStatus(chain, resolveSecrets(chain, legacyWarnings()))
}
