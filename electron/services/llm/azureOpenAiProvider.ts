/**
 * Azure OpenAI adapter. Strict endpoint policy; declares complete + embed.
 * Exposure is gated behind the `azureOpenAiProvider` experimental flag.
 */
import type { LLMProvider } from './types'
import { validateAzureEndpoint } from './azureEndpointPolicy'
import { recordUsage } from './usageLedger'
import {
  fetchJsonBounded,
  LlmTransportError,
  type HttpFetch,
} from './httpJson'

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

  private mapError(err: unknown): never {
    if (err instanceof LlmTransportError) {
      if (err.code === 'network') {
        throw new Error('Cannot reach the Azure OpenAI endpoint. Check the endpoint and your network.')
      }
      if (err.code === 'http-error') {
        if (err.status === 401 || err.status === 403) throw new Error('Azure OpenAI rejected the API key.')
        if (err.status === 429) throw new Error('Azure OpenAI rate limit reached. Try again shortly.')
        throw new Error(`Azure OpenAI request failed (HTTP ${err.status}).`)
      }
      if (err.code === 'malformed-json') {
        throw new Error('Azure OpenAI returned malformed JSON.')
      }
      throw new Error(err.message)
    }
    throw err
  }

  private async post(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      return await fetchJsonBounded(
        url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'api-key': this.apiKey },
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
    const data = (await this.post(this.url(this.deployment, 'chat/completions'), {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }, options?.signal)) as {
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

  async embed(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    const data = (await this.post(this.url(this.embedDeployment, 'embeddings'), { input: text }, options?.signal)) as {
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
    // Prefer a cheap deployments list when the account allows it; fall back to a
    // tiny completion so a locked-down key still gets a conclusive probe.
    try {
      await fetchJsonBounded(
        `${this.origin}/openai/deployments?api-version=${encodeURIComponent(this.apiVersion)}`,
        {
          method: 'GET',
          headers: { 'api-key': this.apiKey },
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