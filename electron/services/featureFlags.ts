/**
 * Main-side experimental-feature enforcement (Phase 0.6).
 *
 * The renderer hides disabled commands for usability, but main is the security
 * control: a disabled cost/instability surface is refused here even if the
 * renderer is bypassed. Resolution uses the same pure `isFeatureEnabled` the
 * renderer uses, so the two can never disagree on what "enabled" means.
 */
import { loadSettings } from './settingsService'
import { isFeatureEnabled, type FeatureFlagId } from '../../shared/featureFlags'
import { ipcError } from '../../shared/contracts/errorWire'
import { debugLog } from './logger'

/** Whether a flag is enabled per the current settings. Failures resolve false. */
export function isFeatureEnabledMain(id: FeatureFlagId): boolean {
  try {
    return isFeatureEnabled(loadSettings().experimentalFeatures, id)
  } catch {
    return false
  }
}

/** Throw a stable coded error unless the flag is enabled. Call before side effects. */
export function assertFeatureEnabled(id: FeatureFlagId): void {
  if (!isFeatureEnabledMain(id)) {
    debugLog('featureFlags', 'blocked disabled feature:', id)
    throw ipcError('feature-disabled', 'This experimental feature is turned off. Enable it in Settings → Experimental Features.')
  }
}
