/**
 * Anthropic completions provider. Uses the shared bounded HTTP transport until
 * the SDK migration lands; embeddings are intentionally unsupported.
 */
import type { CompletionProvider, EmbeddingProvider, LlmCallOptions } from './types'
import { recordUsage } from './usageLedger'
import {
  fetchJsonBounded,
  LlmTransportError,
  type HttpFetch,
} from './httpJson'

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicTextBlock {
  type: string
  text?: string
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export class AnthropicProvider implements CompletionProvider, EmbeddingProvider {
  private apiKey: string
  private model: string
  private fetchImpl: HttpFetch

  constructor(
    apiKey: string,
    model: string = 'claude-sonnet-5',
    fetchImpl: HttpFetch = fetch as unknown as HttpFetch,
  ) {
    this.apiKey = apiKey
    this.model = model
    this.fetchImpl = fetchImpl
  }

  private mapError(err: unknown): never {
    if (err instanceof LlmTransportError) {
      if (err.code === 'network') {
        throw new Error('Cannot reach Anthropic API. Check your internet connection and try again.')
      }
      if (err.code === 'http-error') {
        throw new Error(`Anthropic API request failed (HTTP ${err.status}).`)
      }
      throw new Error(err.message)
    }
    throw err
  }

  private async request(path: string, init: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }): Promise<unknown> {
    try {
      return await fetchJsonBounded(
        `${ANTHROPIC_API_BASE}${path}`,
        {
          method: init.method ?? 'GET',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            ...init.headers,
          },
          body: init.body,
          signal: init.signal,
        },
        this.fetchImpl,
      )
    } catch (err) {
      this.mapError(err)
    }
  }

  async complete(userPrompt: string, systemPrompt: string, options?: LlmCallOptions): Promise<string> {
    const response = await this.request('/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        max_tokens: 2000,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: options?.signal,
    }) as AnthropicMessageResponse

    const text = (response.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n')

    if (response.usage) {
      recordUsage({
        capability: 'complete',
        provider: 'anthropic',
        model: this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      })
    }
    return text
  }

  async embed(_text: string, _options?: LlmCallOptions): Promise<number[]> {
    throw new Error(
      'Anthropic embeddings are not supported. Switch provider to OpenAI for embedding generation and semantic search indexing.',
    )
  }

  async testConnection(): Promise<void> {
    await this.request('/models?limit=1', { method: 'GET' })
  }
}