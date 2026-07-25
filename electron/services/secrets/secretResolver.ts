import {
  SECRET_KEYS,
  maskSecret,
  type AppSecrets,
  type SecretBackend,
  type SecretKey,
  type SecretResolutionResult,
  type SecretSource,
  type SecretWarning,
  type SecretsStatus,
} from './secretBackendTypes'

const EMPTY_SECRETS: AppSecrets = { openaiApiKey: '', anthropicApiKey: '' }

/** De-duplicates warnings by code+message so a repeated probe does not spam the UI. */
function dedupeWarnings(warnings: SecretWarning[]): SecretWarning[] {
  const seen = new Set<string>()
  const result: SecretWarning[] = []
  for (const warning of warnings) {
    const key = `${warning.code}::${warning.message}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(warning)
  }
  return result
}

/**
 * Resolves secrets by walking the chain in order; the first backend that yields a
 * non-empty value for a key wins. Every backend is consulted regardless of
 * availability, because an inactive backend still reports why it is inactive.
 */
export function resolveSecrets(
  chain: SecretBackend[],
  extraWarnings: SecretWarning[] = [],
): SecretResolutionResult {
  const secrets: AppSecrets = { ...EMPTY_SECRETS }
  const sourceByKey: Record<SecretKey, SecretSource> = {
    openaiApiKey: 'none',
    anthropicApiKey: 'none',
  }
  const warnings: SecretWarning[] = [...extraWarnings]

  for (const backend of chain) {
    const { secrets: partial, warnings: backendWarnings } = backend.load()
    warnings.push(...backendWarnings)

    for (const key of SECRET_KEYS) {
      // First non-empty value wins; later backends never override an earlier one.
      if (sourceByKey[key] !== 'none') {
        continue
      }
      const value = partial[key]?.trim()
      if (value) {
        secrets[key] = value
        sourceByKey[key] = backend.id
      }
    }
  }

  if (SECRET_KEYS.every(key => sourceByKey[key] === 'none')) {
    warnings.push({
      code: 'NO_SECRET_AVAILABLE',
      message: 'No API key is configured. Add one in Settings → AI.',
    })
  }

  return { secrets, sourceByKey, warnings: dedupeWarnings(warnings) }
}

/** The first writable backend in the chain, or null when storage is unusable. */
export function findWriteTarget(chain: SecretBackend[]): SecretBackend | null {
  return chain.find(backend => backend.writable && backend.isAvailable()) ?? null
}

/**
 * Applies a partial update to the writable backend.
 *
 * The merge base is the write target's **own** stored values, never the resolved
 * chain — otherwise a key supplied by the read-only env overlay would be baked
 * into encrypted storage the first time the user saved any unrelated setting.
 */
export function saveSecretsToChain(
  chain: SecretBackend[],
  updates: Partial<AppSecrets>,
): { writeTarget: SecretBackend['id']; warnings: SecretWarning[] } {
  const target = findWriteTarget(chain)
  if (!target) {
    throw new Error('No writable secret storage is available. API keys cannot be saved on this machine.')
  }

  const { secrets: stored, warnings } = target.load()
  const merged: AppSecrets = { ...EMPTY_SECRETS, ...stored }

  for (const key of SECRET_KEYS) {
    const update = updates[key]
    if (update === undefined) {
      continue // Field was untouched in the UI; leave the stored value alone.
    }
    merged[key] = update.trim()
  }

  target.save(merged)
  return { writeTarget: target.id, warnings: dedupeWarnings(warnings) }
}

/**
 * Builds the non-secret view handed to the renderer. Raw key values never leave
 * the main process; only presence, a masked preview, and provenance do.
 */
export function buildSecretsStatus(
  chain: SecretBackend[],
  resolution: SecretResolutionResult,
): SecretsStatus {
  const keys = {} as SecretsStatus['keys']

  for (const key of SECRET_KEYS) {
    const value = resolution.secrets[key]
    const source = resolution.sourceByKey[key]
    keys[key] = {
      hasKey: Boolean(value),
      maskedPreview: maskSecret(value),
      source,
      // An env-sourced key cannot be edited in Settings: the overlay always wins
      // on read, so an edit would appear to do nothing.
      readOnly: source === 'env',
    }
  }

  return {
    keys,
    warnings: resolution.warnings,
    backends: chain.map(backend => ({
      id: backend.id,
      available: backend.isAvailable(),
      writable: backend.writable,
    })),
  }
}
