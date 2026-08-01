/**
 * Phase 0.H — settings as one validated draft (main-side core).
 *
 * The renderer edits a draft and asks main to (a) validate a candidate data
 * directory without activating it, and (b) apply the whole draft coherently.
 * Apply validates the settings shape, checks an optimistic revision (so a stale
 * draft cannot clobber a concurrent change), then commits settings and secrets
 * with a compensating rollback: if the secrets write fails after settings were
 * written, the prior settings are restored; if that restore also fails the
 * result is `needs-repair` and the caller must block further writes.
 *
 * All filesystem/persistence effects are injected so this is unit-tested in Node
 * with no real disk or Electron. The IPC handlers wire the real deps and the
 * post-apply archive reload (that part needs the running app).
 */
import { createHash } from 'crypto'
import type { AppSettings } from './settingsService'
import type { AppSecrets } from './secretsService'
import { getProviderDescriptor } from './llm/providerRegistry'

const KNOWN_SECRET_FIELDS: ReadonlyArray<keyof AppSecrets> = ['openaiApiKey', 'anthropicApiKey']

// ─── Revision (optimistic concurrency) ───────────────────────────────────────

/** Deterministic stable JSON so the revision does not depend on key order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')
  return `{${body}}`
}

/** A short content revision of the persisted settings, used for optimistic apply. */
export function settingsRevision(settings: AppSettings): string {
  return createHash('sha256').update(stableStringify(settings)).digest('hex').slice(0, 16)
}

// ─── Settings validation ─────────────────────────────────────────────────────

export type SettingsValidationReason =
  | 'unknown-provider'
  | 'provider-disabled'
  | 'provider-cannot-complete'
  | 'missing-model'
  | 'tag-limits'
  | 'missing-data-directory'

export interface SettingsValidation {
  ok: boolean
  reason?: SettingsValidationReason
}

/** Validate provider/capability/model ownership and bounds before any write. */
export function validateSettings(settings: AppSettings): SettingsValidation {
  const descriptor = getProviderDescriptor(settings.llmProvider)
  if (!descriptor) return { ok: false, reason: 'unknown-provider' }
  if (!descriptor.enabled) return { ok: false, reason: 'provider-disabled' }
  if (!descriptor.capabilities.complete) return { ok: false, reason: 'provider-cannot-complete' }
  if (!settings.llmModel.trim()) return { ok: false, reason: 'missing-model' }
  if (settings.tagSoftLimit > settings.tagHardLimit) return { ok: false, reason: 'tag-limits' }
  if (!settings.dataDirectory.trim()) return { ok: false, reason: 'missing-data-directory' }
  return { ok: true }
}

// ─── Data-directory validation (probe only, never activate) ───────────────────

export interface DirValidationDeps {
  isAbsolute(p: string): boolean
  exists(p: string): boolean
  isDirectory(p: string): boolean
  /** Probe write access (create + delete a temp sibling). Returns false on any error. */
  canWrite(p: string): boolean
  /** Summarize the archive at p without activating it. */
  summarize(p: string): { pairs: number; threads: number }
}

export type ValidateDirStatus = 'ok' | 'unsafe-path' | 'not-found' | 'not-a-directory' | 'not-writable'

export interface ValidateDirResult {
  status: ValidateDirStatus
  summary?: { pairs: number; threads: number }
}

/** Validate a candidate data directory without changing the active archive. */
export function validateDataDirectory(path: string, deps: DirValidationDeps): ValidateDirResult {
  const p = path.trim()
  if (p === '' || p.includes('\0') || !deps.isAbsolute(p)) return { status: 'unsafe-path' }
  if (!deps.exists(p)) return { status: 'not-found' }
  if (!deps.isDirectory(p)) return { status: 'not-a-directory' }
  if (!deps.canWrite(p)) return { status: 'not-writable' }
  return { status: 'ok', summary: deps.summarize(p) }
}

// ─── Apply the whole draft coherently ────────────────────────────────────────

export type ApplyDraftStatus =
  | 'applied'
  | 'invalid'
  | 'stale-revision'
  | 'write-failed'
  | 'needs-repair'

export interface ApplyDraftInput {
  settings: AppSettings
  secretUpdates: Partial<AppSecrets>
  expectedRevision: string
}

export interface ApplyDraftResult {
  status: ApplyDraftStatus
  /** New revision after a successful apply, or the current one on stale-revision. */
  revision?: string
  reason?: string
}

export interface ApplyDraftDeps {
  loadSettings(): AppSettings
  saveSettings(settings: AppSettings): void
  saveSecrets(updates: Partial<AppSecrets>): void
}

export function applyDraft(input: ApplyDraftInput, deps: ApplyDraftDeps): ApplyDraftResult {
  const validation = validateSettings(input.settings)
  if (!validation.ok) return { status: 'invalid', reason: validation.reason }

  const secretKeys = Object.keys(input.secretUpdates) as Array<keyof AppSecrets>
  if (secretKeys.some((k) => !KNOWN_SECRET_FIELDS.includes(k))) {
    return { status: 'invalid', reason: 'unknown-secret-field' }
  }

  const prior = deps.loadSettings()
  if (settingsRevision(prior) !== input.expectedRevision) {
    return { status: 'stale-revision', revision: settingsRevision(prior) }
  }

  // 1. Settings first. An atomic writer leaves the prior file intact on failure,
  //    so a throw here means nothing was committed.
  try {
    deps.saveSettings(input.settings)
  } catch {
    return { status: 'write-failed', reason: 'settings' }
  }

  // 2. Secrets, only if any were edited. On failure, roll settings back.
  if (secretKeys.length > 0) {
    try {
      deps.saveSecrets(input.secretUpdates)
    } catch {
      try {
        deps.saveSettings(prior)
      } catch {
        return { status: 'needs-repair', reason: 'rollback-failed' }
      }
      return { status: 'write-failed', reason: 'secrets' }
    }
  }

  return { status: 'applied', revision: settingsRevision(input.settings) }
}
