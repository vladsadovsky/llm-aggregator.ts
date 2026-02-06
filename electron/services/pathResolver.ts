import { getDataDirectory } from './settingsService'

/**
 * Returns the active data directory from application settings.
 * This is where archive/ and threads.json are located.
 * Defaults to the current working directory.
 */
export function getDataDir(): string {
  return getDataDirectory()
}
