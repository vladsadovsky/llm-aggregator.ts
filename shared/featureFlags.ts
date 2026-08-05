/**
 * Experimental-feature flags (Phase 0.6).
 *
 * Stable ids, default-off, resolved the same way in the renderer and main. A
 * missing or unknown flag resolves to false, and an unknown flag from a newer
 * settings file is preserved (forward compat) but cannot enable behavior in an
 * older app. Dependency-free so both runtimes and tests share one source.
 */

export interface FeatureFlagDescriptor {
  id: string
  label: string
  /** What it does and why it is risky / cost-bearing. */
  description: string
  /** Rough risk/cost signal for the Settings UI. */
  risk: 'low' | 'cost' | 'unstable'
  /** True when toggling requires an app restart to take effect. */
  restartRequired: boolean
}

/**
 * The known flags. Adding a flag here is the only way to make it enableable;
 * everything else fails closed.
 */
export const FEATURE_FLAGS: readonly FeatureFlagDescriptor[] = Object.freeze([
  {
    id: 'localOllamaProvider',
    label: 'Local Ollama provider',
    description:
      'Use a locally running Ollama server for completions/embeddings. Loopback only; no data leaves your machine.',
    risk: 'unstable',
    restartRequired: false,
  },
  {
    id: 'azureOpenAiProvider',
    label: 'Azure OpenAI provider',
    description: 'Use an Azure OpenAI deployment. Requires an endpoint, deployment name, and API key.',
    risk: 'cost',
    restartRequired: false,
  },
  {
    id: 'selfHostedOpenAiProvider',
    label: 'Self-hosted OpenAI-compatible provider',
    description: 'Use a trusted local or LAN OpenAI-compatible API endpoint for completions and embeddings.',
    risk: 'unstable',
    restartRequired: false,
  },
  {
    id: 'insecureLanHttpTesting',
    label: 'Temporary LAN HTTP testing',
    description: 'Development-only exception for a trusted LAN endpoint without TLS. Packaged builds always reject it.',
    risk: 'unstable',
    restartRequired: false,
  },
  {
    id: 'batchLlmJobs',
    label: 'Batch LLM jobs',
    description:
      'Run cost-bearing LLM passes over many Q&A pairs at once (e.g. confidence annotation). Shows an estimate before running.',
    risk: 'cost',
    restartRequired: false,
  },
])

export type FeatureFlagId = (typeof FEATURE_FLAGS)[number]['id']

export const FEATURE_FLAG_IDS: readonly string[] = Object.freeze(FEATURE_FLAGS.map((f) => f.id))

/** The stored shape: an id → boolean map. Unknown ids are preserved but inert. */
export type ExperimentalFeatures = Record<string, boolean>

/**
 * Resolve a flag against a stored map. Unknown/missing/non-true → false. This is
 * the single decision function both renderer and main call.
 */
export function isFeatureEnabled(
  features: ExperimentalFeatures | undefined,
  id: string,
): boolean {
  if (!FEATURE_FLAG_IDS.includes(id)) return false // unknown id fails closed
  return features?.[id] === true
}
