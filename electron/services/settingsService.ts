import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { debugLog, debugError } from './logger'
import { getDefaultDataDirectory } from './defaultDataDirectory'

const isDev = process.env.NODE_ENV !== 'production'
const TEST_DATA_DIR_ENV = 'LLM_AGGREGATOR_DATA_DIR'

export interface AppSettings {
  /** Absolute path to the data directory containing archive/ and threads.json */
  dataDirectory: string
  /** LLM provider to use for AI features */
  llmProvider: string
  /** Model to use for completions (provider-specific) */
  llmModel: string
  /** Tag vocabulary enforcement mode */
  tagEnforcement: 'off' | 'warn' | 'strict'
  /** Vocabulary size at which a soft warning appears when adding new tags */
  tagSoftLimit: number
  /** Vocabulary size at which new tags are blocked entirely (strict mode) */
  tagHardLimit: number
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
    tagEnforcement: 'warn',
    tagSoftLimit: 50,
    tagHardLimit: 100,
  }

  if (!existsSync(filepath)) {
    debugLog('settingsService', 'settings.json not found, using defaults:', defaults.dataDirectory)
    return defaults
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<AppSettings>
    return {
      ...defaults,
      ...parsed,
    }
  } catch (err) {
    debugError('settingsService', 'Failed to load settings, using defaults:', err)
    return defaults
  }
}

export function saveSettings(settings: AppSettings): void {
  const filepath = getSettingsPath()
  const dir = join(filepath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filepath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getDataDirectory(): string {
  const testDataDir = process.env[TEST_DATA_DIR_ENV]?.trim()
  if (testDataDir) {
    return testDataDir
  }
  return loadSettings().dataDirectory
}
