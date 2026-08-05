/**
 * Local Ollama adapter. Loopback-only; declares complete + embed + local.
 * Exposure is gated behind the `localOllamaProvider` experimental flag.
 */
import type { CompletionProvider, EmbeddingProvider } from './types'
import { validateLocalEndpoint } from './localEndpointPolicy'
import { recordUsage } from './usageLedger'
import {
  fetchJsonBounded,
  LlmTransportError,
  type HttpFetch,
} from './httpJson'

export type { HttpFetch }

export interface OllamaConfig {
  endpoint?: string
  model: string
  embedModel?: string
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434'

export class OllamaProvider implements CompletionProvider, EmbeddingProvider {
  private base: string
  private model: string
  private embedModel: string
  private fetchImpl: HttpFetch

  constructor(config: OllamaConfig, fetchImpl: HttpFetch = fetch as unknown as HttpFetch) {
    const check = validateLocalEndpoint(config.endpoint ?? DEFAULT_ENDPOINT)
    if (!check.ok || !check.origin) {
      throw new Error(
        `Ollama endpoint rejected (${check.reason}). Only a loopback address (127.0.0.1 / localhost) is allowed.`,
      )
    }
    this.base = check.origin
    this.model = config.model
    this.embedModel = config.embedModel ?? config.model
    this.fetchImpl = fetchImpl
  }

  private mapError(err: unknown): never {
    if (err instanceof LlmTransportError) {
      if (err.code === 'network') {
        throw new Error(`Cannot reach Ollama at ${this.base}. Is the server running?`)
      }
      if (err.code === 'http-error' && err.status === 404) {
        throw new Error(`Ollama model "${this.model}" is not installed (pull it first).`)
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
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        },
        this.fetchImpl,
      )
    } catch (err) {
      this.mapError(err)
    }
  }

  async complete(
    userPrompt: string,
    systemPrompt: string,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const data = (await this.post(
      '/api/chat',
      {
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      options?.signal,
    )) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }

    recordUsage({
      capability: 'complete',
      provider: 'ollama',
      model: this.model,
      local: true,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    })
    return data.message?.content ?? ''
  }

  async embed(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    const data = (await this.post(
      '/api/embeddings',
      { model: this.embedModel, prompt: text },
      options?.signal,
    )) as { embedding?: number[] }
    recordUsage({ capability: 'embed', provider: 'ollama', model: this.embedModel, local: true })
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Ollama returned an empty embedding.')
    }
    return data.embedding
  }

  async testConnection(): Promise<void> {
    try {
      await fetchJsonBounded(
        `${this.base}/api/tags`,
        { method: 'GET' },
        this.fetchImpl,
      )
    } catch (err) {
      if (err instanceof LlmTransportError && err.code === 'network') {
        throw new Error(`Cannot reach Ollama at ${this.base}. Is the server running?`)
      }
      if (err instanceof LlmTransportError && err.code === 'http-error') {
        throw new Error(`Ollama is reachable but returned HTTP ${err.status}.`)
      }
      this.mapError(err)
    }
  }
}