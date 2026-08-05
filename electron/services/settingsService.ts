import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { debugLog, debugError } from './logger'
import { getDefaultDataDirectory } from './defaultDataDirectory'
import { atomicWriteJsonSync } from './persistence/atomicFile'
import type { ExperimentalFeatures } from '../../shared/featureFlags'

export interface ProviderConnectionSettings {
  /** Fully-qualified API base URL, preserving a server-specific route prefix. */
  endpoint?: string
  embeddingModel?: string
  trustedHosts?: string[]
  /** Development-only temporary exception; main rejects it in packaged builds. */
  allowInsecureLanHttp?: boolean
  /** Azure-specific API version. */
  apiVersion?: string
}

const isDev = process.env.NODE_ENV !== 'production'
const TEST_DATA_DIR_ENV = 'LLM_AGGREGATOR_DATA_DIR'

export interface AppSettings {
  /** Absolute path to the data directory containing archive/ and threads.json */
  dataDirectory: string
  /** LLM provider to use for AI features */
  llmProvider: string
  /** Model to use for completions (provider-specific) */
  llmModel: string
  /** Show the optional LLM Lens interface and related commands. */
  lensEnabled: boolean
  /** Tag vocabulary enforcement mode */
  tagEnforcement: 'off' | 'warn' | 'strict'
  /** Vocabulary size at which a soft warning appears when adding new tags */
  tagSoftLimit: number
  /** Vocabulary size at which new tags are blocked entirely (strict mode) */
  tagHardLimit: number
  /**
   * Allow development-only environment variables to override stored secrets.
   * Honoured only in unpackaged builds; see `secrets/backends/envSecretsBackend.ts`.
   * The variable prefix is the fixed constant `LLM_AGG_`.
   */
  allowDevEnvSecrets: boolean
  /**
   * Experimental-feature toggles (id → boolean). Default-off; unknown ids are
   * preserved for forward compatibility but resolve false. See
   * `shared/featureFlags.ts`.
   */
  experimentalFeatures?: ExperimentalFeatures
  /** Per-provider connection metadata. Credentials remain in secure storage. */
  providerConnections?: {
    ollama?: ProviderConnectionSettings
    azure?: ProviderConnectionSettings
    selfHostedOpenAi?: ProviderConnectionSettings
  }
}

const SETTINGS_FILENAME = 'settings.json'

function getSettingsPath(): string {
  // In packaged app, store settings in userData; 
  // In dev unpackaged, if production mode is set, the same as in packaged
  // else next to the app (current working directory) for easier access and cleanup
  if (app.isPackaged) {
    return join(app.getPath('userData'), SETTINGS_FILENAME)
  } else if (isDev ) {
    return join(app.getPath('userData'), SETTINGS_FILENAME)
  }
  return join(process.cwd(), SETTINGS_FILENAME)
}

export function loadSettings(): AppSettings {
  const filepath = getSettingsPath()
  debugLog('settingsService', 'loadSettings from:', filepath)
  const defaults: AppSettings = {
    dataDirectory: getDefaultDataDirectory(),
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
    lensEnabled: false,
    tagEnforcement: 'warn',
    tagSoftLimit: 50,
    tagHardLimit: 100,
    allowDevEnvSecrets: false,
    experimentalFeatures: {},
    providerConnections: {},
  }

  if (!existsSync(filepath)) {
    debugLog('settingsService', 'settings.json not found, using defaults:', defaults.dataDirectory)
    return defaults
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<AppSettings>
    const merged = {
      ...defaults,
      ...parsed,
    }
    return {
      ...merged,
      lensEnabled: merged.lensEnabled === true,
      // Coerce explicitly: this flag gates a security-relevant code path, so a
      // truthy-but-not-boolean value in the file must not enable it by accident.
      allowDevEnvSecrets: merged.allowDevEnvSecrets === true,
    }
  } catch (err) {
    debugError('settingsService', 'Failed to load settings, using defaults:', err)
    return defaults
  }
}

export function saveSettings(settings: AppSettings): void {
  // Atomic + last-known-good: a crash or disk-full during save can never replace
  // a valid settings.json with a truncated one (INV-DATA).
  atomicWriteJsonSync(getSettingsPath(), settings, { keepLastKnownGood: true })
}

export function getDataDirectory(): string {
  const testDataDir = process.env[TEST_DATA_DIR_ENV]?.trim()
  if (testDataDir) {
    return testDataDir
  }
  return loadSettings().dataDirectory
}
