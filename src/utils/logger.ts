/**
 * Conditional debug logger for the renderer (Vue) process.
 * Logs only when Vite is running in dev mode (import.meta.env.DEV).
 */
export function debugLog(tag: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(`[${tag}]`, ...args)
  }
}

export function debugError(tag: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error(`[${tag}]`, ...args)
  }
}
