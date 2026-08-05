import type { LLMProvider } from './types'
import type { HttpFetch } from './ollamaProvider'
import { validateSelfHostedEndpoint } from './selfHostedEndpointPolicy'
import { recordUsage } from './usageLedger'

export interface SelfHostedOpenAiConfig {
  endpoint: string
  model: string
  embedModel?: string
  apiKey?: string
  trustedHosts: string[]
  allowInsecureLanHttp: boolean
}

export class SelfHostedOpenAiProvider implements LLMProvider {
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

  private async post(path: string, body: unknown): Promise<unknown> {
    let response
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('Cannot reach the self-hosted OpenAI-compatible endpoint.')
    }
    if (!response.ok) throw new Error(`Self-hosted endpoint failed (HTTP ${response.status}).`)
    try { return await response.json() } catch { throw new Error('Self-hosted endpoint returned malformed JSON.') }
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    const data = await this.post('/chat/completions', {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    }) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    recordUsage({ capability: 'complete', provider: 'self-hosted-openai', model: this.model, local: true, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 })
    return data.choices?.[0]?.message?.content ?? ''
  }

  async embed(text: string): Promise<number[]> {
    const data = await this.post('/embeddings', { model: this.embedModel, input: text }) as { data?: Array<{ embedding?: number[] }>; usage?: { prompt_tokens?: number } }
    const vector = data.data?.[0]?.embedding
    if (!Array.isArray(vector) || vector.length === 0) throw new Error('Self-hosted endpoint returned an empty embedding.')
    recordUsage({ capability: 'embed', provider: 'self-hosted-openai', model: this.embedModel, local: true, inputTokens: data.usage?.prompt_tokens ?? 0 })
    return vector
  }

  async testConnection(): Promise<void> {
    await this.complete('ping', 'Reply with OK.')
  }
}
