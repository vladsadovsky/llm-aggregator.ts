import { existsSync } from 'fs'
import { homedir } from 'os'
import { join, win32 } from 'path'

const APP_DATA_FOLDER = 'LLM-Aggregator'
const ONEDRIVE_ENV_KEYS = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'] as const

/**
 * Pick a stable, user-writable archive location on Windows. An existing
 * OneDrive root advertised by the sync client is treated as active.
 */
export function getDefaultDataDirectory(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  directoryExists: (path: string) => boolean = existsSync,
): string {
  if (platform !== 'win32') {
    return process.cwd()
  }

  for (const key of ONEDRIVE_ENV_KEYS) {
    const root = env[key]?.trim()
    if (root && directoryExists(root)) {
      return win32.join(root, 'Documents', APP_DATA_FOLDER)
    }
  }

  const userProfile = env.USERPROFILE?.trim() || homedir()
  return win32.join(userProfile, 'Documents', APP_DATA_FOLDER)
}
