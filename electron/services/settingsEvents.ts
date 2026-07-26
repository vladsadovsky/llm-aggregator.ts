import type { AppSettings } from './settingsService'

let listener: ((settings: AppSettings) => void) | null = null

export function setSettingsChangeListener(nextListener: (settings: AppSettings) => void): void {
  listener = nextListener
}

export function notifySettingsChanged(settings: AppSettings): void {
  listener?.(settings)
}