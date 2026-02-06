import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppSettings {
  /** Absolute path to the data directory containing archive/ and threads.json */
  dataDirectory: string
}

const SETTINGS_FILENAME = 'settings.json'

function getSettingsPath(): string {
  // In packaged app, store settings in userData; in dev, next to the app
  if (app.isPackaged) {
    return join(app.getPath('userData'), SETTINGS_FILENAME)
  }
  return join(process.cwd(), SETTINGS_FILENAME)
}

function getDefaultDataDir(): string {
  // Default: current working directory (where the app is launched from)
  return process.cwd()
}

export function loadSettings(): AppSettings {
  const filepath = getSettingsPath()
  const defaults: AppSettings = {
    dataDirectory: getDefaultDataDir(),
  }

  if (!existsSync(filepath)) {
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
    console.error('Failed to load settings, using defaults:', err)
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
  return loadSettings().dataDirectory
}
