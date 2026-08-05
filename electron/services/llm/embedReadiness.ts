/**
 * Runtime embed readiness cache (design-review P1 / H5).
 *
 * Declared embed capability is not proof that the selected model/deployment can
 * embed. After a successful probe (or first successful embed), we remember the
 * outcome keyed by provider+model+endpoint fingerprint so semantic search can
 * degrade with a clear message instead of a generic failure.
 */

export type EmbedReadinessState = 'unknown' | 'ready' | 'unavailable'

export interface EmbedReadiness {
  state: EmbedReadinessState
  reason?: string
  checkedAt?: string
  fingerprint?: string
}

let current: EmbedReadiness = { state: 'unknown' }

export function getEmbedReadiness(): EmbedReadiness {
  return { ...current }
}

export function resetEmbedReadiness(): void {
  current = { state: 'unknown' }
}

/** Mark embed ready after a successful probe or embed call. */
export function markEmbedReady(fingerprint: string): void {
  current = {
    state: 'ready',
    checkedAt: new Date().toISOString(),
    fingerprint,
  }
}

/** Mark embed unavailable with a safe user-facing reason. */
export function markEmbedUnavailable(fingerprint: string, reason: string): void {
  current = {
    state: 'unavailable',
    reason,
    checkedAt: new Date().toISOString(),
    fingerprint,
  }
}

/**
 * If settings fingerprint changed since the last probe, readiness is stale.
 * Callers should treat a fingerprint mismatch as unknown.
 */
export function readinessMatches(fingerprint: string): boolean {
  return current.state !== 'unknown' && current.fingerprint === fingerprint
}
