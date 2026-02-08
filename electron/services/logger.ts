/**
 * Conditional debug logger for the main (Electron) process.
 * Logs only when NODE_ENV !== 'production' (i.e. during `npm run dev`).
 */
const isDev = process.env.NODE_ENV !== 'production'

export function debugLog(tag: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(`[${tag}]`, ...args)
  }
}

export function debugError(tag: string, ...args: unknown[]): void {
  if (isDev) {
    console.error(`[${tag}]`, ...args)
  }
}
