/**
 * Local Ollama adapter (Phase 0.1). Loopback-only; declares complete + embed +
 * local. Not wired into the live factory/UI yet — exposure is gated behind the
 * `localOllamaProvider` flag and lands in Phase 2.5.
 */
import type { LLMProvider } from './types'
import { validateLocalEndpoint } from './localEndpointPolicy'
import { recordUsage } from './usageLedger'

export interface HttpFetch {
  (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    ok: boolean
    status: number
    json(): Promise<unknown>
    text(): Promise<string>
  }>
}

export interface OllamaConfig {
  endpoint?: string
  model: string
  embedModel?: string
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434'

export class OllamaProvider implements LLMProvider {
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

  private async post(path: string, body: unknown): Promise<unknown> {
    let res
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error(`Cannot reach Ollama at ${this.base}. Is the server running?`)
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Ollama model "${this.model}" is not installed (pull it first).`)
      throw new Error(`Ollama request failed (HTTP ${res.status}).`)
    }
    try {
      return await res.json()
    } catch {
      throw new Error('Ollama returned malformed JSON.')
    }
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    const data = (await this.post('/api/chat', {
      model: this.model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }

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

  async embed(text: string): Promise<number[]> {
    const data = (await this.post('/api/embeddings', { model: this.embedModel, prompt: text })) as {
      embedding?: number[]
    }
    recordUsage({ capability: 'embed', provider: 'ollama', model: this.embedModel, local: true })
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Ollama returned an empty embedding.')
    }
    return data.embedding
  }

  async testConnection(): Promise<void> {
    let res
    try {
      res = await this.fetchImpl(`${this.base}/api/tags`, { method: 'GET' })
    } catch {
      throw new Error(`Cannot reach Ollama at ${this.base}. Is the server running?`)
    }
    if (!res.ok) throw new Error(`Ollama is reachable but returned HTTP ${res.status}.`)
  }
}
