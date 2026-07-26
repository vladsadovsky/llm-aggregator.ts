/**
 * Conditional debug logger for the renderer (Vue) process.
 *
 * Level resolution lives in `shared/logCore.ts`; this module only supplies the
 * `import.meta.env` configuration sources. Errors are emitted at the baseline in
 * every build, including production, so failures are never silently swallowed.
 * Set `VITE_DEBUG_LEVEL` to raise verbosity.
 */
import { LogLevel, createLogger, resolveConfiguredLevel } from '../../shared/logCore'

const configuredLevel = resolveConfiguredLevel({
  explicitLevels: [import.meta.env.VITE_DEBUG_LEVEL as string | undefined],
  legacyFlags: [import.meta.env.VITE_DEBUG_LOGS as string | undefined],
})

export const { debugTrace, debugLog, debugWarn, debugError } = createLogger(configuredLevel)
export { LogLevel }
