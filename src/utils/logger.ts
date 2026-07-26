/**
 * Conditional debug logger for the renderer (Vue) process.
 *
 * Debug traces are intentionally opt-in even in development builds to keep
 * routine local runs quiet.
 */
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  WARNING = 2,
  ERROR = 3,
}

function envFlagEnabled(value: string | undefined): boolean {
  return value ? TRUE_VALUES.has(value.trim().toLowerCase()) : false
}

function parseLogLevel(raw: string | undefined): LogLevel | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === '') return null

  if (normalized === 'trace') return LogLevel.TRACE
  if (normalized === 'debug') return LogLevel.DEBUG
  if (normalized === 'warning' || normalized === 'warn') return LogLevel.WARNING
  if (normalized === 'error') return LogLevel.ERROR

  const numeric = Number(normalized)
  if (Number.isInteger(numeric) && numeric >= LogLevel.TRACE && numeric <= LogLevel.ERROR) {
    return numeric as LogLevel
  }
  return null
}

function resolveConfiguredLevel(): LogLevel | null {
  const explicitLevel = parseLogLevel(import.meta.env.VITE_DEBUG_LEVEL as string | undefined)
  if (explicitLevel !== null) {
    return explicitLevel
  }

  // Backward-compatibility with the previous boolean flag.
  if (envFlagEnabled(import.meta.env.VITE_DEBUG_LOGS as string | undefined)) {
    return LogLevel.DEBUG
  }

  // Default production baseline keeps only error-level diagnostics.
  return import.meta.env.DEV ? null : LogLevel.ERROR
}

const configuredLevel = import.meta.env.DEV ? resolveConfiguredLevel() : null

function shouldLog(level: LogLevel): boolean {
  return configuredLevel !== null && configuredLevel <= level
}

export function debugTrace(tag: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.TRACE)) {
    console.log(`[${tag}]`, ...args)
  }
}

export function debugLog(tag: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.DEBUG)) {
    console.log(`[${tag}]`, ...args)
  }
}

export function debugWarn(tag: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.WARNING)) {
    console.warn(`[${tag}]`, ...args)
  }
}

export function debugError(tag: string, ...args: unknown[]): void {
  if (shouldLog(LogLevel.ERROR)) {
    console.error(`[${tag}]`, ...args)
  }
}
