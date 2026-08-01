/**
 * Phase 0.1 SSRF guard: the local (Ollama) endpoint may only be loopback.
 */
import { describe, it, expect } from 'vitest'
import { validateLocalEndpoint } from '../../electron/services/llm/localEndpointPolicy'

describe('validateLocalEndpoint', () => {
  it('accepts loopback forms', () => {
    expect(validateLocalEndpoint('http://127.0.0.1:11434').ok).toBe(true)
    expect(validateLocalEndpoint('http://localhost:11434').ok).toBe(true)
    expect(validateLocalEndpoint('http://127.5.5.5:1234').ok).toBe(true)
    expect(validateLocalEndpoint('http://[::1]:11434').ok).toBe(true)
  })

  it('rejects non-loopback IPv4 / LAN / public hosts', () => {
    expect(validateLocalEndpoint('http://192.168.1.10:11434').reason).toBe('not-loopback')
    expect(validateLocalEndpoint('http://10.0.0.5:11434').reason).toBe('not-loopback')
    expect(validateLocalEndpoint('http://8.8.8.8:11434').reason).toBe('not-loopback')
  })

  it('rejects DNS names that are not localhost', () => {
    expect(validateLocalEndpoint('http://evil.example:11434').reason).toBe('not-loopback')
    expect(validateLocalEndpoint('http://ollama.internal:11434').reason).toBe('not-loopback')
  })

  it('rejects credentials and bad schemes', () => {
    expect(validateLocalEndpoint('http://user:pass@127.0.0.1:11434').reason).toBe('has-credentials')
    expect(validateLocalEndpoint('ftp://127.0.0.1').reason).toBe('bad-scheme')
    expect(validateLocalEndpoint('file:///etc/passwd').reason).toBe('bad-scheme')
  })

  it('normalizes to an origin, dropping any path', () => {
    expect(validateLocalEndpoint('http://127.0.0.1:11434/anything').origin).toBe('http://127.0.0.1:11434')
  })

  it('rejects an unparseable value', () => {
    expect(validateLocalEndpoint('not a url').reason).toBe('invalid-url')
  })
})
