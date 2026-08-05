/**
 * Phase 0.1 adapter contract: Ollama and Azure adapters reject unsafe endpoints
 * before any call, complete/embed against a fake transport, map errors to clear
 * messages, and meter one ledger entry per call.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { OllamaProvider, type HttpFetch } from '../../electron/services/llm/ollamaProvider'
import { AzureOpenAIProvider } from '../../electron/services/llm/azureOpenAiProvider'
import { SelfHostedOpenAiProvider } from '../../electron/services/llm/selfHostedOpenAiProvider'
import { getSessionUsage, resetUsage } from '../../electron/services/llm/usageLedger'

beforeEach(() => resetUsage())

type Resp = { ok: boolean; status: number; body: unknown }
function fetchReturning(...responses: Resp[]): HttpFetch {
  let i = 0
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return { ok: r.ok, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) }
  }
}
const throwingFetch: HttpFetch = async () => {
  throw new Error('ECONNREFUSED')
}

describe('OllamaProvider', () => {
  it('refuses a non-loopback endpoint at construction', () => {
    expect(() => new OllamaProvider({ endpoint: 'http://192.168.1.5:11434', model: 'llama3' })).toThrow(
      /loopback/,
    )
  })

  it('completes and meters a local (zero-cost) call', async () => {
    const fetchImpl = fetchReturning({
      ok: true,
      status: 200,
      body: { message: { content: 'hi' }, prompt_eval_count: 5, eval_count: 3 },
    })
    const p = new OllamaProvider({ model: 'llama3' }, fetchImpl)
    expect(await p.complete('q', 's')).toBe('hi')
    const usage = getSessionUsage()
    expect(usage.entries[0]).toMatchObject({ provider: 'ollama', local: true, approxCostUsd: 0, calls: 1 })
  })

  it('embeds against the fake transport', async () => {
    const p = new OllamaProvider({ model: 'llama3' }, fetchReturning({ ok: true, status: 200, body: { embedding: [0.1, 0.2] } }))
    expect(await p.embed('text')).toEqual([0.1, 0.2])
  })

  it('maps a connection failure to a clear message', async () => {
    const p = new OllamaProvider({ model: 'llama3' }, throwingFetch)
    await expect(p.complete('q', 's')).rejects.toThrow(/Cannot reach Ollama/)
  })

  it('maps a 404 to a missing-model message', async () => {
    const p = new OllamaProvider({ model: 'llama3' }, fetchReturning({ ok: false, status: 404, body: {} }))
    await expect(p.complete('q', 's')).rejects.toThrow(/not installed/)
  })
})

describe('AzureOpenAIProvider', () => {
  const cfg = {
    endpoint: 'https://my-resource.openai.azure.com',
    deployment: 'gpt4o',
    apiVersion: '2024-10-01',
    apiKey: 'secret',
  }

  it('refuses an unapproved endpoint at construction', () => {
    expect(() => new AzureOpenAIProvider({ ...cfg, endpoint: 'https://evil.example' })).toThrow(/rejected/)
  })

  it('requires deployment, version, and key', () => {
    expect(() => new AzureOpenAIProvider({ ...cfg, deployment: '' })).toThrow(/deployment/)
    expect(() => new AzureOpenAIProvider({ ...cfg, apiKey: '' })).toThrow(/key/)
  })

  it('completes and meters a remote call', async () => {
    const fetchImpl = fetchReturning({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 4 } },
    })
    const p = new AzureOpenAIProvider(cfg, fetchImpl)
    expect(await p.complete('q', 's')).toBe('ok')
    expect(getSessionUsage().entries[0]).toMatchObject({ provider: 'azure', model: 'gpt4o', local: false })
  })

  it('maps auth and rate-limit failures', async () => {
    await expect(
      new AzureOpenAIProvider(cfg, fetchReturning({ ok: false, status: 401, body: {} })).complete('q', 's'),
    ).rejects.toThrow(/rejected the API key/)
    await expect(
      new AzureOpenAIProvider(cfg, fetchReturning({ ok: false, status: 429, body: {} })).complete('q', 's'),
    ).rejects.toThrow(/rate limit/)
  })
})

describe('SelfHostedOpenAiProvider', () => {
  const cfg = {
    endpoint: 'https://dgx.internal.example/apps/aggregator/v1',
    model: 'local-qwen',
    trustedHosts: ['dgx.internal.example'],
    allowInsecureLanHttp: false,
  }

  it('preserves the fully-qualified server route and uses its optional key', async () => {
    let requestedUrl = ''
    let requestHeaders: Record<string, string> = {}
    const fetchImpl: HttpFetch = async (url, options) => {
      requestedUrl = url
      requestHeaders = options?.headers ?? {}
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'done' } }] }),
        text: async () => '',
      }
    }

    const provider = new SelfHostedOpenAiProvider({ ...cfg, apiKey: 'secret' }, fetchImpl)
    await expect(provider.complete('question', 'system')).resolves.toBe('done')
    expect(requestedUrl).toBe('https://dgx.internal.example/apps/aggregator/v1/chat/completions')
    expect(requestHeaders.authorization).toBe('Bearer secret')
  })

  it('rejects LAN HTTP unless the factory explicitly grants the development exception', () => {
    expect(() => new SelfHostedOpenAiProvider({
      ...cfg,
      endpoint: 'http://10.0.0.5/apps/aggregator/v1',
      trustedHosts: ['10.0.0.5'],
    })).toThrow(/insecure-lan-http/)
  })
})
