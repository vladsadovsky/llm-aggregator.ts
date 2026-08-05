export type ProviderKind = 'openai' | 'anthropic' | 'openai-compatible'

/** Immutable capability declaration checked by the UI and re-checked by factories. */
export interface ProviderCapabilities {
  complete: boolean
  embed: boolean
  streaming: boolean
  /** Runs against a local endpoint (loopback) rather than a remote API. */
  local: boolean
}

export type ProviderCapability = keyof ProviderCapabilities

export interface ProviderDescriptor {
  id: string
  label: string
  kind: ProviderKind
  enabled: boolean
  comingSoon?: boolean
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey' | 'azureApiKey' | 'selfHostedApiKey'
  supportsModelDiscovery: boolean
  capabilities: ProviderCapabilities
  notes?: string
}

const PROVIDERS: ProviderDescriptor[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    enabled: true,
    supportsModelDiscovery: true,
    apiKeyField: 'openaiApiKey',
    capabilities: { complete: true, embed: true, streaming: false, local: false },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    enabled: true,
    supportsModelDiscovery: true,
    apiKeyField: 'anthropicApiKey',
    capabilities: { complete: true, embed: false, streaming: false, local: false },
    notes: 'Claude model support enabled. Embeddings are not available via Anthropic API.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai-compatible',
    enabled: true,
    supportsModelDiscovery: false,
    capabilities: { complete: true, embed: true, streaming: false, local: true },
    notes: 'Experimental. Connects only to a local Ollama server.',
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    kind: 'openai-compatible',
    enabled: true,
    apiKeyField: 'azureApiKey',
    supportsModelDiscovery: false,
    capabilities: { complete: true, embed: true, streaming: false, local: false },
    notes: 'Experimental. Configure an Azure endpoint and deployment in Settings.',
  },
  {
    id: 'self-hosted-openai',
    label: 'Self-hosted OpenAI-compatible',
    kind: 'openai-compatible',
    enabled: true,
    apiKeyField: 'selfHostedApiKey',
    supportsModelDiscovery: true,
    capabilities: { complete: true, embed: true, streaming: false, local: true },
    notes: 'Experimental. Uses a fully-qualified trusted local or LAN API base URL.',
  },
]

const EXPERIMENTAL_PROVIDER_FLAGS: Partial<Record<string, string>> = {
  ollama: 'localOllamaProvider',
  azure: 'azureOpenAiProvider',
  'self-hosted-openai': 'selfHostedOpenAiProvider',
}

export function listProviderDescriptors(experimentalFeatures?: Record<string, boolean>): ProviderDescriptor[] {
  return PROVIDERS.map((provider) => ({
    ...provider,
    enabled: provider.enabled && (
      !EXPERIMENTAL_PROVIDER_FLAGS[provider.id] ||
      experimentalFeatures?.[EXPERIMENTAL_PROVIDER_FLAGS[provider.id]!] === true
    ),
  }))
}

export function getProviderDescriptor(
  providerId: string,
  experimentalFeatures?: Record<string, boolean>,
): ProviderDescriptor | null {
  return listProviderDescriptors(experimentalFeatures).find(provider => provider.id === providerId) ?? null
}

/** True when the named provider declares the given capability. Unknown → false. */
export function providerSupports(
  providerId: string,
  capability: ProviderCapability,
  experimentalFeatures?: Record<string, boolean>,
): boolean {
  const match = getProviderDescriptor(providerId, experimentalFeatures)
  return match ? match.capabilities[capability] === true : false
}
