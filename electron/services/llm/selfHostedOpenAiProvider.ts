/**
 * Self-hosted OpenAI-compatible adapter (experimental).
 * Uses the shared bounded HTTP transport and a trusted-host endpoint policy.
 */
import type { CompletionProvider, EmbeddingProvider, LlmCallOptions } from './types'
import { validateSelfHostedEndpoint } from './selfHostedEndpointPolicy'
import { recordUsage } from './usageLedger'
import {
  fetchJsonBounded,
  LlmTransportError,
  type HttpFetch,
} from './httpJson'

export interface SelfHostedOpenAiConfig {
  endpoint: string
  model: string
  embedModel?: string
  apiKey?: string
  trustedHosts: string[]
  allowInsecureLanHttp: boolean
}

export class SelfHostedOpenAiProvider implements CompletionProvider, EmbeddingProvider {
  private base: string
  private model: string
  private embedModel: string
  private apiKey: string
  private fetchImpl: HttpFetch

  constructor(config: SelfHostedOpenAiConfig, fetchImpl: HttpFetch = fetch as unknown as HttpFetch) {
    const checked = validateSelfHostedEndpoint(config.endpoint, config.trustedHosts, config.allowInsecureLanHttp)
    if (!checked.ok || !checked.baseUrl) throw new Error(`Self-hosted endpoint rejected (${checked.reason}).`)
    if (!config.model.trim()) throw new Error('A self-hosted completion model is required.')
    this.base = checked.baseUrl
    this.model = config.model.trim()
    this.embedModel = (config.embedModel ?? config.model).trim()
    this.apiKey = config.apiKey?.trim() ?? ''
    this.fetchImpl = fetchImpl
  }

  private mapError(err: unknown): never {
    if (err instanceof LlmTransportError) {
      if (err.code === 'network') {
        throw new Error('Cannot reach the self-hosted OpenAI-compatible endpoint.')
      }
      if (err.code === 'http-error') {
        throw new Error(`Self-hosted endpoint failed (HTTP ${err.status}).`)
      }
      if (err.code === 'malformed-json') {
        throw new Error('Self-hosted endpoint returned malformed JSON.')
      }
      throw new Error(err.message)
    }
    throw err
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      return await fetchJsonBounded(
        `${this.base}${path}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal,
        },
        this.fetchImpl,
      )
    } catch (err) {
      this.mapError(err)
    }
  }

  async complete(userPrompt: string, systemPrompt: string, options?: LlmCallOptions): Promise<string> {
    const data = await this.post('/chat/completions', {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    }, options?.signal) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    recordUsage({
      capability: 'complete',
      provider: 'self-hosted-openai',
      model: this.model,
      local: true,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    })
    return data.choices?.[0]?.message?.content ?? ''
  }

  async embed(text: string, options?: LlmCallOptions): Promise<number[]> {
    const data = await this.post('/embeddings', {
      model: this.embedModel,
      input: text,
    }, options?.signal) as {
      data?: Array<{ embedding?: number[] }>
      usage?: { prompt_tokens?: number }
    }
    const vector = data.data?.[0]?.embedding
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('Self-hosted endpoint returned an empty embedding.')
    }
    recordUsage({
      capability: 'embed',
      provider: 'self-hosted-openai',
      model: this.embedModel,
      local: true,
      inputTokens: data.usage?.prompt_tokens ?? 0,
    })
    return vector
  }

  async testConnection(): Promise<void> {
    // Prefer models list when exposed; otherwise a tiny completion.
    try {
      await fetchJsonBounded(
        `${this.base}/models`,
        {
          method: 'GET',
          headers: {
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          },
        },
        this.fetchImpl,
      )
    } catch (err) {
      if (err instanceof LlmTransportError && err.code === 'http-error' && (err.status === 404 || err.status === 405)) {
        await this.complete('ping', 'Reply with OK.')
        return
      }
      this.mapError(err)
    }
  }
}