import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { debugLog, debugError } from './logger'

export interface AppSecrets {
  openaiApiKey: string
  anthropicApiKey: string
}

const SECRETS_FILENAME = 'secrets.json'

function getSecretsPath(): string {
  return join(app.getPath('userData'), SECRETS_FILENAME)
}

const defaults: AppSecrets = {
  openaiApiKey: '',
  anthropicApiKey: '',
}

export function loadSecrets(): AppSecrets {
  const filepath = getSecretsPath()
  debugLog('secretsService', 'loadSecrets from:', filepath)

  if (!existsSync(filepath)) {
    return { ...defaults }
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    return { ...defaults, ...(JSON.parse(content) as Partial<AppSecrets>) }
  } catch (err) {
    debugError('secretsService', 'Failed to load secrets, using defaults:', err)
    return { ...defaults }
  }
}

export function saveSecrets(secrets: AppSecrets): void {
  const filepath = getSecretsPath()
  const dir = join(filepath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filepath, JSON.stringify(secrets, null, 2), 'utf-8')
}
