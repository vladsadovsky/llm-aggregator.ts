/**
 * Pre-call readiness / cost guard for LLM work (design-review P0 / H3).
 *
 * Validates the selected provider can serve the requested capability *before*
 * any network call: experimental flag, declared capability, required key, and
 * required connection fields. Does not invent hard dollar caps yet — it fails
 * closed on configuration gaps and leaves metering to `usageLedger`.
 */
import { loadSecrets } from '../secretsService'
import { loadSettings, type AppSettings } from '../settingsService'
import { getProviderDescriptor, providerSupports, type ProviderCapability } from './providerRegistry'
import { validateLocalEndpoint } from './localEndpointPolicy'
import { validateAzureEndpoint } from './azureEndpointPolicy'
import { validateSelfHostedEndpoint } from './selfHostedEndpointPolicy'
import { app } from 'electron'
import { isFeatureEnabled } from '../../../shared/featureFlags'

export type LlmCallCapability = Extract<ProviderCapability, 'complete' | 'embed'>

export interface AssertCanCallLlmOptions {
  capability: LlmCallCapability
  /** Optional estimated input tokens for future hard-limit warnings. */
  estimatedTokens?: number
}

export interface LlmCallContext {
  providerId: string
  label: string
  model: string
  local: boolean
  capability: LlmCallCapability
}

function requireModel(settings: AppSettings): string {
  const model = (settings.llmModel ?? '').trim()
  if (!model) throw new Error('No model is configured. Choose a model in Settings → AI.')
  return model
}

/**
 * Throw a clear, pre-network error when the active provider cannot serve the
 * requested capability, or when required keys/endpoints are missing.
 */
export function assertCanCallLlm(options: AssertCanCallLlmOptions): LlmCallContext {
  const settings = loadSettings()
  const providerId = (settings.llmProvider ?? 'openai').trim().toLowerCase()
  const descriptor = getProviderDescriptor(providerId, settings.experimentalFeatures)
  if (!descriptor) {
    throw new Error(`Unknown provider: "${providerId}". Select a configured provider in Settings → AI.`)
  }
  if (!descriptor.enabled) {
    throw new Error(`${descriptor.label} is experimental and is not enabled in Settings.`)
  }
  if (!providerSupports(providerId, options.capability, settings.experimentalFeatures)) {
    const noun = options.capability === 'embed' ? 'embeddings' : options.capability
    throw new Error(
      `${descriptor.label} does not support ${noun}. Select a provider that does in Settings → AI.`,
    )
  }

  const model = requireModel(settings)
  const secrets = loadSecrets()

  if (providerId === 'openai') {
    if (!secrets.openaiApiKey?.trim()) {
      throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    }
  } else if (providerId === 'anthropic') {
    if (!secrets.anthropicApiKey?.trim()) {
      throw new Error('Anthropic API key not configured. Add it in Settings → AI.')
    }
  } else if (providerId === 'ollama') {
    const endpoint = settings.providerConnections?.ollama?.endpoint ?? 'http://127.0.0.1:11434'
    const check = validateLocalEndpoint(endpoint)
    if (!check.ok) {
      throw new Error('Ollama endpoint is invalid. Only a loopback address is allowed.')
    }
  } else if (providerId === 'azure') {
    const config = settings.providerConnections?.azure
    if (!secrets.azureApiKey?.trim()) {
      throw new Error('Azure API key not configured. Add it in Settings → AI.')
    }
    if (!config?.endpoint?.trim()) {
      throw new Error('Azure endpoint is required. Configure it in Settings → AI.')
    }
    if (!config.apiVersion?.trim()) {
      throw new Error('Azure API version is required. Configure it in Settings → AI.')
    }
    const check = validateAzureEndpoint(config.endpoint)
    if (!check.ok) {
      throw new Error('Azure endpoint is invalid. Use your https://<resource>.openai.azure.com endpoint.')
    }
  } else if (providerId === 'self-hosted-openai') {
    const config = settings.providerConnections?.selfHostedOpenAi
    if (!config?.endpoint?.trim()) {
      throw new Error('Self-hosted endpoint is required. Configure it in Settings → AI.')
    }
    const allowInsecure =
      !app.isPackaged &&
      isFeatureEnabled(settings.experimentalFeatures, 'insecureLanHttpTesting') &&
      config.allowInsecureLanHttp === true
    const check = validateSelfHostedEndpoint(config.endpoint, config.trustedHosts ?? [], allowInsecure)
    if (!check.ok) {
      throw new Error(`Self-hosted endpoint rejected (${check.reason}).`)
    }
  }

  return {
    providerId,
    label: descriptor.label,
    model,
    local: descriptor.capabilities.local === true,
    capability: options.capability,
  }
}
