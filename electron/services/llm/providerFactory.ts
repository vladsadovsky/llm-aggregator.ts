import { loadSecrets } from '../secretsService'
import { loadSettings } from '../settingsService'
import { OpenAIProvider } from './openaiProvider'
import { AnthropicProvider } from './anthropicProvider'
import { OllamaProvider } from './ollamaProvider'
import { AzureOpenAIProvider } from './azureOpenAiProvider'
import { SelfHostedOpenAiProvider } from './selfHostedOpenAiProvider'
import { app } from 'electron'
import type { AppSecrets } from '../secretsService'
import type { AppSettings } from '../settingsService'
import type { CompletionProvider, EmbeddingProvider, LLMProvider } from './types'
import { getProviderDescriptor, providerSupports, type ProviderCapability } from './providerRegistry'
import { isFeatureEnabled } from '../../../shared/featureFlags'

/** The selected provider id, validated against the registry. */
function selectedProviderId(settings: AppSettings): string {
  return (settings.llmProvider ?? 'openai').trim().toLowerCase()
}

/** Construct the concrete provider for the current settings/secrets. */
function constructProvider(providerId: string, secrets: AppSecrets, settings: AppSettings): LLMProvider {
  const provider = getProviderDescriptor(providerId, settings.experimentalFeatures)
  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}". Select a configured provider in Settings → AI.`)
  }
  if (!provider.enabled) {
    throw new Error(`${provider.label} is experimental and is not enabled in Settings.`)
  }

  if (provider.id === 'openai') {
    if (!secrets.openaiApiKey) throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    return new OpenAIProvider(secrets.openaiApiKey, settings.llmModel || 'gpt-4o')
  }

  if (provider.id === 'anthropic') {
    if (!secrets.anthropicApiKey) throw new Error('Anthropic API key not configured. Add it in Settings → AI.')
    return new AnthropicProvider(secrets.anthropicApiKey, settings.llmModel || 'claude-sonnet-5')
  }

  if (provider.id === 'ollama') {
    const config = settings.providerConnections?.ollama
    return new OllamaProvider({ endpoint: config?.endpoint, model: settings.llmModel, embedModel: config?.embeddingModel })
  }

  if (provider.id === 'azure') {
    const config = settings.providerConnections?.azure
    return new AzureOpenAIProvider({
      endpoint: config?.endpoint ?? '', deployment: settings.llmModel,
      embedDeployment: config?.embeddingModel, apiVersion: config?.apiVersion ?? '', apiKey: secrets.azureApiKey,
    })
  }

  if (provider.id === 'self-hosted-openai') {
    const config = settings.providerConnections?.selfHostedOpenAi
    return new SelfHostedOpenAiProvider({
      endpoint: config?.endpoint ?? '', model: settings.llmModel, embedModel: config?.embeddingModel,
      apiKey: secrets.selfHostedApiKey, trustedHosts: config?.trustedHosts ?? [],
      allowInsecureLanHttp: !app.isPackaged && isFeatureEnabled(settings.experimentalFeatures, 'insecureLanHttpTesting') && config?.allowInsecureLanHttp === true,
    })
  }

  if (provider.kind === 'openai-compatible') {
    throw new Error(`${provider.label} is marked as OpenAI-compatible but runtime wiring is not implemented yet.`)
  }

  throw new Error(`Provider "${provider.id}" is not implemented.`)
}

/**
 * Throw a clear, pre-network error when the selected provider does not declare a
 * capability — instead of letting a runtime method (e.g. Anthropic `embed()`)
 * trap deep inside a call. Removes provider-name checks from callers (INV-LLM).
 */
function assertCapability(providerId: string, capability: ProviderCapability, settings: AppSettings): void {
  if (!providerSupports(providerId, capability, settings.experimentalFeatures)) {
    const label = getProviderDescriptor(providerId, settings.experimentalFeatures)?.label ?? providerId
    const noun = capability === 'embed' ? 'embeddings' : capability
    throw new Error(
      `${label} does not support ${noun}. Select a provider that does in Settings → AI.`,
    )
  }
}

/** A provider for text completion. */
export function getCompletionProvider(): CompletionProvider {
  const settings = loadSettings()
  const providerId = selectedProviderId(settings)
  assertCapability(providerId, 'complete', settings)
  return constructProvider(providerId, loadSecrets(), settings)
}

/**
 * A provider for embeddings. Validates the embed capability BEFORE constructing
 * or calling, so an embedding request against Anthropic fails with a clear
 * message rather than trapping inside `embed()`.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const settings = loadSettings()
  const providerId = selectedProviderId(settings)
  assertCapability(providerId, 'embed', settings)
  return constructProvider(providerId, loadSecrets(), settings)
}

/**
 * Backwards-compatible accessor for completion consumers (annotation, insights,
 * metadata, connection test). Prefer `getCompletionProvider`.
 */
export function getProvider(): LLMProvider {
  const settings = loadSettings()
  return constructProvider(selectedProviderId(settings), loadSecrets(), settings)
}
