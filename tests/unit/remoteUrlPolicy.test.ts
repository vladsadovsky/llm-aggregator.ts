/**
 * INV-NET: remote import targets and redirect hops must be HTTPS, credential-
 * free, default-port, and on an exact registered host. Tokens are redacted.
 */
import { describe, it, expect } from 'vitest'
import {
  validateRemoteUrl,
  redactUrl,
  SHARE_API_HOSTS,
  GEMINI_RENDER_HOSTS,
} from '../../electron/services/import/remoteUrlPolicy'

describe('validateRemoteUrl', () => {
  it('accepts a valid share-API host', () => {
    expect(validateRemoteUrl('https://claude.ai/api/chat_snapshots/abc', SHARE_API_HOSTS).ok).toBe(true)
    expect(validateRemoteUrl('https://chatgpt.com/backend-api/share/x', SHARE_API_HOSTS).ok).toBe(true)
  })

  it('rejects non-HTTPS', () => {
    expect(validateRemoteUrl('http://claude.ai/x', SHARE_API_HOSTS).reason).toBe('insecure-scheme')
  })

  it('rejects embedded credentials', () => {
    expect(validateRemoteUrl('https://user:pass@claude.ai/x', SHARE_API_HOSTS).reason).toBe('has-credentials')
  })

  it('rejects a non-default port', () => {
    expect(validateRemoteUrl('https://claude.ai:8443/x', SHARE_API_HOSTS).reason).toBe('non-default-port')
  })

  it('rejects an unknown host', () => {
    expect(validateRemoteUrl('https://evil.example/x', SHARE_API_HOSTS).reason).toBe('host-not-allowed')
  })

  it('rejects a look-alike subdomain not on the allowlist', () => {
    expect(validateRemoteUrl('https://claude.ai.evil.example/x', SHARE_API_HOSTS).reason).toBe('host-not-allowed')
  })

  it('rejects an unparseable URL', () => {
    expect(validateRemoteUrl('not a url', SHARE_API_HOSTS).reason).toBe('invalid-url')
  })

  it('is scoped per allowlist (a share host is not a Gemini render host)', () => {
    expect(validateRemoteUrl('https://claude.ai/x', GEMINI_RENDER_HOSTS).ok).toBe(false)
    expect(validateRemoteUrl('https://gemini.google.com/share/x', GEMINI_RENDER_HOSTS).ok).toBe(true)
    // accounts.google.com sign-in is deliberately NOT a render host.
    expect(validateRemoteUrl('https://accounts.google.com/x', GEMINI_RENDER_HOSTS).ok).toBe(false)
  })
})

describe('redactUrl', () => {
  it('masks the final path segment (the share token)', () => {
    expect(redactUrl('https://claude.ai/api/chat_snapshots/SECRET123')).toBe(
      'https://claude.ai/api/chat_snapshots/<redacted>',
    )
  })
  it('drops query and fragment', () => {
    expect(redactUrl('https://chatgpt.com/share/abc?token=xyz#frag')).toBe(
      'https://chatgpt.com/share/<redacted>',
    )
  })
  it('handles an unparseable url safely', () => {
    expect(redactUrl('%%%')).toBe('<unparseable-url>')
  })
})
