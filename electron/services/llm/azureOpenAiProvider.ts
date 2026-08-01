/**
 * Azure OpenAI adapter (Phase 0.1). Strict endpoint policy; declares complete +
 * embed. Not wired into the live factory/UI yet — exposure is gated behind the
 * `azureOpenAiProvider` flag and lands in Phase 2.5.
 */
import type { LLMProvider } from './types'
import { validateAzureEndpoint } from './azureEndpointPolicy'
import { recordUsage } from './usageLedger'
import type { HttpFetch } from './ollamaProvider'

export interface AzureConfig {
  endpoint: string
  deployment: string
  apiVersion: string
  apiKey: string
  /** Deployment used for embeddings, if different from the completion deployment. */
  embedDeployment?: string
}

export class AzureOpenAIProvider implements LLMProvider {
  private origin: string
  private deployment: string
  private embedDeployment: string
  private apiVersion: string
  private apiKey: string
  private fetchImpl: HttpFetch

  constructor(config: AzureConfig, fetchImpl: HttpFetch = fetch as unknown as HttpFetch) {
    const check = validateAzureEndpoint(config.endpoint)
    if (!check.ok || !check.origin) {
      throw new Error(`Azure endpoint rejected (${check.reason}). Use your https://<resource>.openai.azure.com endpoint.`)
    }
    if (!config.deployment.trim()) throw new Error('Azure deployment name is required.')
    if (!config.apiVersion.trim()) throw new Error('Azure API version is required.')
    if (!config.apiKey) throw new Error('Azure API key is required.')
    this.origin = check.origin
    this.deployment = config.deployment.trim()
    this.embedDeployment = (config.embedDeployment ?? config.deployment).trim()
    this.apiVersion = config.apiVersion.trim()
    this.apiKey = config.apiKey
    this.fetchImpl = fetchImpl
  }

  private url(deployment: string, op: string): string {
    return `${this.origin}/openai/deployments/${encodeURIComponent(deployment)}/${op}?api-version=${encodeURIComponent(this.apiVersion)}`
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    let res
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('Cannot reach the Azure OpenAI endpoint. Check the endpoint and your network.')
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Azure OpenAI rejected the API key.')
      if (res.status === 429) throw new Error('Azure OpenAI rate limit reached. Try again shortly.')
      throw new Error(`Azure OpenAI request failed (HTTP ${res.status}).`)
    }
    try {
      return await res.json()
    } catch {
      throw new Error('Azure OpenAI returned malformed JSON.')
    }
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    const data = (await this.post(this.url(this.deployment, 'chat/completions'), {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    recordUsage({
      capability: 'complete',
      provider: 'azure',
      model: this.deployment,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    })
    return data.choices?.[0]?.message?.content ?? ''
  }

  async embed(text: string): Promise<number[]> {
    const data = (await this.post(this.url(this.embedDeployment, 'embeddings'), { input: text })) as {
      data?: Array<{ embedding?: number[] }>
      usage?: { prompt_tokens?: number }
    }
    recordUsage({
      capability: 'embed',
      provider: 'azure',
      model: this.embedDeployment,
      inputTokens: data.usage?.prompt_tokens ?? 0,
    })
    const embedding = data.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Azure OpenAI returned an empty embedding.')
    }
    return embedding
  }

  async testConnection(): Promise<void> {
    // A minimal completion is the most reliable deployment-level check.
    await this.complete('ping', 'Reply with OK.')
  }
}
