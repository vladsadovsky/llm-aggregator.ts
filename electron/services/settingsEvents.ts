/**
 * settingsEvents.ts
 * Main-process fan-out for "settings were saved".
 *
 * A list rather than a single slot: registration used to overwrite, so a second
 * consumer would have silently unhooked the first (the menu rebuild) with no
 * error anywhere. Registering returns its own disposer, so consumers never need
 * to know about each other.
 */

import type { AppSettings } from './settingsService'
import { debugError } from './logger'

type SettingsChangeListener = (settings: AppSettings) => void

const listeners = new Set<SettingsChangeListener>()

/** Register a listener. Returns a disposer that removes exactly this one. */
export function addSettingsChangeListener(listener: SettingsChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function removeSettingsChangeListener(listener: SettingsChangeListener): void {
  listeners.delete(listener)
}

/**
 * Notify every listener. Iterates a copy so a listener that registers or
 * disposes during dispatch cannot corrupt the walk, and isolates throws so one
 * bad consumer cannot stop the others from seeing the change.
 */
export function notifySettingsChanged(settings: AppSettings): void {
  for (const listener of [...listeners]) {
    try {
      listener(settings)
    } catch (err) {
      debugError('settingsEvents', 'settings change listener threw', err)
    }
  }
}

/** Test seam: drop every registration. */
export function clearSettingsChangeListeners(): void {
  listeners.clear()
}
