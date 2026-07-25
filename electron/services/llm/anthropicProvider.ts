import type { LLMProvider } from './types'

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicTextBlock {
  type: string
  text?: string
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[]
}

function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }
  const message = err.message.toLowerCase()
  return message.includes('network') || message.includes('fetch') || message.includes('timeout')
}

function wrapNetworkError(err: unknown): never {
  if (isLikelyNetworkError(err)) {
    throw new Error('Cannot reach Anthropic API. Check your internet connection and try again.')
  }
  throw err
}

async function anthropicRequest<T>(
  apiKey: string,
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<T> {
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    ...init.headers,
  }

  const response = await fetch(`${ANTHROPIC_API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let details = ''
    try {
      details = await response.text()
    } catch {
      details = ''
    }
    const suffix = details ? ` ${details}` : ''
    throw new Error(`Anthropic API request failed (${response.status}).${suffix}`)
  }

  return response.json() as Promise<T>
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model: string = 'claude-sonnet-5') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    try {
      const response = await anthropicRequest<AnthropicMessageResponse>(this.apiKey, '/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          system: systemPrompt,
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      })

      const text = (response.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('\n')

      return text
    } catch (err) {
      wrapNetworkError(err)
    }
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error('Anthropic embeddings are not supported. Switch provider to OpenAI for embedding generation and semantic search indexing.')
  }

  async testConnection(): Promise<void> {
    try {
      await anthropicRequest<{ data?: Array<{ id: string }> }>(this.apiKey, '/models?limit=1', {
        method: 'GET',
      })
    } catch (err) {
      wrapNetworkError(err)
    }
  }
}
