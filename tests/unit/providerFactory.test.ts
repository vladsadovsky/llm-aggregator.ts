/**
 * INV-LLM: the factory validates the selected provider's capability before
 * constructing or calling — an embedding request against a completion-only
 * provider fails with a clear message, not a runtime trap inside embed().
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/services/settingsService', () => ({ loadSettings: vi.fn() }))
vi.mock('../../electron/services/secretsService', () => ({
  loadSecrets: vi.fn(() => ({ openaiApiKey: 'sk-openai', anthropicApiKey: 'sk-anthropic' })),
}))
vi.mock('../../electron/services/llm/openaiProvider', () => ({
  OpenAIProvider: class {
    complete = () => Promise.resolve('')
    embed = () => Promise.resolve([])
    testConnection = () => Promise.resolve()
  },
}))
vi.mock('../../electron/services/llm/anthropicProvider', () => ({
  AnthropicProvider: class {
    complete = () => Promise.resolve('')
    embed = () => {
      throw new Error('anthropic cannot embed')
    }
    testConnection = () => Promise.resolve()
  },
}))

import {
  getCompletionProvider,
  getEmbeddingProvider,
} from '../../electron/services/llm/providerFactory'
import { loadSettings } from '../../electron/services/settingsService'
import { loadSecrets } from '../../electron/services/secretsService'

function selectProvider(id: string) {
  vi.mocked(loadSettings).mockReturnValue({ llmProvider: id, llmModel: 'm' } as never)
}

describe('provider factory capability validation', () => {
  it('rejects embeddings for a completion-only provider before any network/key check', () => {
    selectProvider('anthropic')
    vi.mocked(loadSecrets).mockClear()
    expect(() => getEmbeddingProvider()).toThrow(/does not support embeddings/)
    // Rejected before constructing → secrets never loaded.
    expect(loadSecrets).not.toHaveBeenCalled()
  })

  it('returns an embedding provider for a provider that supports it', () => {
    selectProvider('openai')
    expect(getEmbeddingProvider()).toBeDefined()
  })

  it('returns a completion provider for a completion-capable provider', () => {
    selectProvider('anthropic')
    expect(getCompletionProvider()).toBeDefined()
  })

  it('rejects an unknown provider', () => {
    selectProvider('mystery')
    expect(() => getCompletionProvider()).toThrow(/does not support|Unknown provider/)
  })
})
