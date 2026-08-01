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
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey'
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
]

export function listProviderDescriptors(): ProviderDescriptor[] {
  return PROVIDERS.map(provider => ({ ...provider }))
}

export function getProviderDescriptor(providerId: string): ProviderDescriptor | null {
  const match = PROVIDERS.find(provider => provider.id === providerId)
  return match ? { ...match } : null
}

/** True when the named provider declares the given capability. Unknown → false. */
export function providerSupports(providerId: string, capability: ProviderCapability): boolean {
  const match = PROVIDERS.find(provider => provider.id === providerId)
  return match ? match.capabilities[capability] === true : false
}
