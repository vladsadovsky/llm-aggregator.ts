import OpenAI, { APIConnectionError, APIConnectionTimeoutError } from 'openai'
import type { LLMProvider } from './types'
import { recordUsage } from './usageLedger'

const EMBEDDING_MODEL = 'text-embedding-3-small'

// Network-related Node.js error codes
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',       // DNS lookup failed — no internet or bad hostname
  'ECONNREFUSED',    // Connection refused
  'ECONNRESET',      // Connection reset mid-flight
  'ETIMEDOUT',       // TCP connection timed out
  'EAI_AGAIN',       // Temporary DNS failure
  'ENETUNREACH',     // Network unreachable
  'EHOSTUNREACH',    // Host unreachable
])

function wrapNetworkError(err: unknown): never {
  // OpenAI SDK connection errors
  if (err instanceof APIConnectionTimeoutError) {
    throw new Error('Request timed out — the OpenAI API did not respond in time. Check your network connection and try again.')
  }
  if (err instanceof APIConnectionError) {
    throw new Error('Cannot reach the OpenAI API — check your internet connection and try again.')
  }

  // Raw Node.js network errors (e.g. from underlying http/https calls)
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    if (code && NETWORK_ERROR_CODES.has(code)) {
      throw new Error(`Network error (${code}) — check your internet connection and try again.`)
    }
  }

  // Rethrow anything else unchanged
  throw err
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      })
      if (response.usage) {
        recordUsage({
          capability: 'complete',
          provider: 'openai',
          model: this.model,
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        })
      }
      return response.choices[0]?.message?.content ?? ''
    } catch (err) {
      wrapNetworkError(err)
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      })
      if (response.usage) {
        recordUsage({
          capability: 'embed',
          provider: 'openai',
          model: EMBEDDING_MODEL,
          inputTokens: response.usage.prompt_tokens,
        })
      }
      const embedding = response.data[0]?.embedding
      if (!embedding) throw new Error('Embedding API returned an empty response.')
      return embedding
    } catch (err) {
      wrapNetworkError(err)
    }
  }

  async testConnection(): Promise<void> {
    try {
      // Minimal call: list models — fast, cheap, conclusive
      await this.client.models.list()
    } catch (err) {
      wrapNetworkError(err)
    }
  }
}
