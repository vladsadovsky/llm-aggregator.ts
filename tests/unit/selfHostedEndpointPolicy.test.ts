import { describe, expect, it } from 'vitest'
import { validateSelfHostedEndpoint } from '../../electron/services/llm/selfHostedEndpointPolicy'

describe('self-hosted OpenAI-compatible endpoint policy', () => {
  it('preserves a fully-qualified API path for a trusted HTTPS LAN host', () => {
    expect(validateSelfHostedEndpoint(
      'https://dgx.example.internal/apps/archive-llm/v1/', ['dgx.example.internal'], false,
    )).toEqual({ ok: true, baseUrl: 'https://dgx.example.internal/apps/archive-llm/v1' })
  })

  it('allows HTTP only for loopback or the explicit temporary LAN exception', () => {
    expect(validateSelfHostedEndpoint('http://127.0.0.1:8080/v1', [], false).ok).toBe(true)
    expect(validateSelfHostedEndpoint('http://dgx.example.internal/v1', ['dgx.example.internal'], false)).toEqual({
      ok: false, reason: 'insecure-lan-http',
    })
    expect(validateSelfHostedEndpoint('http://dgx.example.internal/v1', ['dgx.example.internal'], true).ok).toBe(true)
  })

  it('rejects endpoints that could escape the trusted server policy', () => {
    expect(validateSelfHostedEndpoint('https://other.example.internal/v1', ['dgx.example.internal'], false)).toEqual({
      ok: false, reason: 'untrusted-host',
    })
    expect(validateSelfHostedEndpoint('https://user:pass@dgx.example.internal/v1', ['dgx.example.internal'], false)).toEqual({
      ok: false, reason: 'has-credentials',
    })
    expect(validateSelfHostedEndpoint('https://dgx.example.internal/v1?target=x', ['dgx.example.internal'], false)).toEqual({
      ok: false, reason: 'has-query-or-fragment',
    })
  })
})
