/**
 * Framework-agnostic core for the app's leveled debug loggers.
 *
 * Both the Electron main process (`electron/services/logger.ts`) and the Vue
 * renderer (`src/utils/logger.ts`) build their loggers from this module. The
 * only per-process difference is where the configuration strings come from
 * (`process.env` vs `import.meta.env`), so that resolution stays in the thin
 * per-side wrappers and every other piece lives here to avoid the two loggers
 * drifting apart.
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  WARNING = 2,
  ERROR = 3,
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function envFlagEnabled(value: string | undefined): boolean {
  return value ? TRUE_VALUES.has(value.trim().toLowerCase()) : false
}

export function parseLogLevel(raw: string | undefined): LogLevel | null {
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

export interface LevelResolutionInput {
  /** Explicit level strings in precedence order; the first parseable one wins. */
  explicitLevels?: Array<string | undefined>
  /** Legacy boolean flags; any truthy one selects DEBUG. */
  legacyFlags?: Array<string | undefined>
}

/**
 * Resolves the active threshold.
 *
 * The baseline is ERROR in every build — dev *and* production — so real
 * failures are never silently swallowed. An explicit level override or a legacy
 * debug flag lowers the threshold to surface more verbose output.
 */
export function resolveConfiguredLevel(input: LevelResolutionInput = {}): LogLevel {
  for (const raw of input.explicitLevels ?? []) {
    const level = parseLogLevel(raw)
    if (level !== null) {
      return level
    }
  }
  if ((input.legacyFlags ?? []).some(envFlagEnabled)) {
    return LogLevel.DEBUG
  }
  return LogLevel.ERROR
}

export interface LeveledLogger {
  debugTrace(tag: string, ...args: unknown[]): void
  debugLog(tag: string, ...args: unknown[]): void
  debugWarn(tag: string, ...args: unknown[]): void
  debugError(tag: string, ...args: unknown[]): void
}

/**
 * Builds the four leveled log functions bound to a fixed threshold. A message
 * is emitted when its severity is at or above the configured level.
 */
export function createLogger(configuredLevel: LogLevel): LeveledLogger {
  const shouldLog = (level: LogLevel): boolean => configuredLevel <= level
  return {
    debugTrace(tag, ...args) {
      if (shouldLog(LogLevel.TRACE)) console.log(`[${tag}]`, ...args)
    },
    debugLog(tag, ...args) {
      if (shouldLog(LogLevel.DEBUG)) console.log(`[${tag}]`, ...args)
    },
    debugWarn(tag, ...args) {
      if (shouldLog(LogLevel.WARNING)) console.warn(`[${tag}]`, ...args)
    },
    debugError(tag, ...args) {
      if (shouldLog(LogLevel.ERROR)) console.error(`[${tag}]`, ...args)
    },
  }
}
