export type ProviderKind = 'openai' | 'anthropic' | 'openai-compatible'

export interface ProviderDescriptor {
  id: string
  label: string
  kind: ProviderKind
  enabled: boolean
  comingSoon?: boolean
  apiKeyField?: 'openaiApiKey' | 'anthropicApiKey'
  supportsModelDiscovery: boolean
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
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    enabled: true,
    supportsModelDiscovery: true,
    apiKeyField: 'anthropicApiKey',
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
