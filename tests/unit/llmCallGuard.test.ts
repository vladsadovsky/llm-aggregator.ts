import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

const loadSettings = vi.fn()
const loadSecrets = vi.fn()

vi.mock('../../electron/services/settingsService', () => ({
  loadSettings: () => loadSettings(),
}))
vi.mock('../../electron/services/secretsService', () => ({
  loadSecrets: () => loadSecrets(),
}))

import { assertCanCallLlm } from '../../electron/services/llm/llmCallGuard'

function baseSettings(over: Record<string, unknown> = {}) {
  return {
    dataDirectory: '/data',
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
    lensEnabled: false,
    tagEnforcement: 'warn',
    tagSoftLimit: 50,
    tagHardLimit: 100,
    allowDevEnvSecrets: false,
    experimentalFeatures: {},
    providerConnections: {},
    ...over,
  }
}

beforeEach(() => {
  loadSettings.mockReset()
  loadSecrets.mockReset()
  loadSecrets.mockReturnValue({
    openaiApiKey: 'sk-test',
    anthropicApiKey: '',
    azureApiKey: '',
    selfHostedApiKey: '',
  })
})

describe('assertCanCallLlm', () => {
  it('returns context for a ready OpenAI completion call', () => {
    loadSettings.mockReturnValue(baseSettings())
    const ctx = assertCanCallLlm({ capability: 'complete' })
    expect(ctx).toMatchObject({
      providerId: 'openai',
      capability: 'complete',
      local: false,
      model: 'gpt-4o',
    })
  })

  it('fails closed without an OpenAI key', () => {
    loadSettings.mockReturnValue(baseSettings())
    loadSecrets.mockReturnValue({
      openaiApiKey: '',
      anthropicApiKey: '',
      azureApiKey: '',
      selfHostedApiKey: '',
    })
    expect(() => assertCanCallLlm({ capability: 'complete' })).toThrow(/OpenAI API key/)
  })

  it('rejects a disabled experimental provider', () => {
    loadSettings.mockReturnValue(baseSettings({ llmProvider: 'ollama' }))
    expect(() => assertCanCallLlm({ capability: 'complete' })).toThrow(/experimental/)
  })

  it('requires azure connection fields', () => {
    loadSettings.mockReturnValue(baseSettings({
      llmProvider: 'azure',
      experimentalFeatures: { azureOpenAiProvider: true },
      providerConnections: { azure: { endpoint: '', apiVersion: '' } },
    }))
    loadSecrets.mockReturnValue({
      openaiApiKey: '',
      anthropicApiKey: '',
      azureApiKey: 'az-key',
      selfHostedApiKey: '',
    })
    expect(() => assertCanCallLlm({ capability: 'complete' })).toThrow(/Azure endpoint/)
  })

  it('rejects Anthropic embed capability', () => {
    loadSettings.mockReturnValue(baseSettings({
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-5',
    }))
    loadSecrets.mockReturnValue({
      openaiApiKey: '',
      anthropicApiKey: 'ant-key',
      azureApiKey: '',
      selfHostedApiKey: '',
    })
    expect(() => assertCanCallLlm({ capability: 'embed' })).toThrow(/embeddings/)
  })
})
