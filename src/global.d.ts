/**
 * The preload module owns the renderer-facing IPC contract. Keep this file to
 * the Window augmentation only so its copy cannot drift from the bridge.
 */
import type { ElectronAPI } from '../electron/preload'

// Preserve existing renderer imports while making preload the sole declaration
// source for every bridge payload and method type.
export * from '../electron/preload'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
