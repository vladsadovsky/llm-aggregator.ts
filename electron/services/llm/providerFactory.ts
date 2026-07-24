import { loadSecrets } from '../secretsService'
import { loadSettings } from '../settingsService'
import { OpenAIProvider } from './openaiProvider'
import type { LLMProvider } from './types'

export function getProvider(): LLMProvider {
  const secrets = loadSecrets()
  const settings = loadSettings()
  const provider = settings.llmProvider ?? 'openai'

  if (provider === 'openai') {
    if (!secrets.openaiApiKey) throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    return new OpenAIProvider(secrets.openaiApiKey, settings.llmModel || 'gpt-4o')
  }

  if (provider === 'anthropic') {
    throw new Error('Anthropic provider is not yet implemented.')
  }

  throw new Error(`Unknown provider: "${provider}"`)
}
