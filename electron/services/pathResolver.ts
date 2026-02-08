import { basename, resolve } from 'path'
import { getDataDirectory } from './settingsService'

/**
 * Returns the active data directory from application settings.
 * This is where archive/ and threads.json are located.
 * Defaults to the current working directory.
 */
export function getDataDir(): string {
  const configured = resolve(getDataDirectory())

  // If the user selected the archive folder itself, use its parent as data dir.
  if (basename(configured).toLowerCase() === 'archive') {
    return resolve(configured, '..')
  }

  return configured
}
