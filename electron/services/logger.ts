/**
 * Conditional debug logger for the main (Electron) process.
 *
 * Level resolution lives in `shared/logCore.ts`; this module only supplies the
 * `process.env` configuration sources. Errors are emitted at the baseline in
 * every build, including production, so failures are never silently swallowed.
 * Set `LLM_AGG_DEBUG_LEVEL` (or `VITE_DEBUG_LEVEL`) to raise verbosity.
 */
import { LogLevel, createLogger, resolveConfiguredLevel } from '../../shared/logCore'

const configuredLevel = resolveConfiguredLevel({
  explicitLevels: [process.env.LLM_AGG_DEBUG_LEVEL, process.env.VITE_DEBUG_LEVEL],
  legacyFlags: [process.env.VITE_DEBUG_LOGS, process.env.LLM_AGG_DEBUG_LOGS],
})

export const { debugTrace, debugLog, debugWarn, debugError } = createLogger(configuredLevel)
export { LogLevel }
