import { loadSecrets } from '../secretsService'
import { loadSettings } from '../settingsService'
import { OpenAIProvider } from './openaiProvider'
import { AnthropicProvider } from './anthropicProvider'
import type { LLMProvider } from './types'
import { getProviderDescriptor } from './providerRegistry'

export function getProvider(): LLMProvider {
  const secrets = loadSecrets()
  const settings = loadSettings()
  const providerId = (settings.llmProvider ?? 'openai').trim().toLowerCase()
  const provider = getProviderDescriptor(providerId)

  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}". Select a configured provider in Settings → AI.`)
  }

  if (provider.id === 'openai') {
    if (!secrets.openaiApiKey) throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    return new OpenAIProvider(secrets.openaiApiKey, settings.llmModel || 'gpt-4o')
  }

  if (provider.id === 'anthropic') {
    if (!secrets.anthropicApiKey) throw new Error('Anthropic API key not configured. Add it in Settings → AI.')
    return new AnthropicProvider(secrets.anthropicApiKey, settings.llmModel || 'claude-sonnet-5')
  }

  if (provider.kind === 'openai-compatible') {
    throw new Error(`${provider.label} is marked as OpenAI-compatible but runtime wiring is not implemented yet.`)
  }

  throw new Error(`Provider "${provider.id}" is not implemented.`)
}
