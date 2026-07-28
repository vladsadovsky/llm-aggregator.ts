/**
 * SEC-01 navigation / external-link policy (S3). The Electron wiring in main.ts
 * and handlers.ts is a thin wrapper over these pure decisions.
 */
import { describe, it, expect } from 'vitest'
import {
  isSameAppNavigation,
  isExternallyOpenable,
  windowOpenAction,
} from '../../electron/security/navigationPolicy'

describe('windowOpenAction', () => {
  it('always denies renderer-created windows', () => {
    expect(windowOpenAction()).toEqual({ action: 'deny' })
  })
})

describe('isSameAppNavigation — dev', () => {
  const policy = { devUrl: 'http://localhost:5173', appOrigin: 'http://localhost:5173' }

  it('allows same-origin navigation within the dev server', () => {
    expect(isSameAppNavigation('http://localhost:5173/', policy)).toBe(true)
    expect(isSameAppNavigation('http://localhost:5173/#/thread/1', policy)).toBe(true)
  })

  it('blocks navigation to any remote origin', () => {
    expect(isSameAppNavigation('https://evil.example/steal', policy)).toBe(false)
    expect(isSameAppNavigation('http://localhost:9999/', policy)).toBe(false)
    expect(isSameAppNavigation('file:///etc/passwd', policy)).toBe(false)
    expect(isSameAppNavigation('not a url', policy)).toBe(false)
  })
})

describe('isSameAppNavigation — packaged (file:)', () => {
  const policy = { appOrigin: '' } // no devUrl in prod

  it('allows the packaged file document and blocks remote pages', () => {
    expect(isSameAppNavigation('file:///C:/app/dist/index.html', policy)).toBe(true)
    expect(isSameAppNavigation('https://evil.example/', policy)).toBe(false)
    expect(isSameAppNavigation('http://localhost:5173/', policy)).toBe(false)
  })
})

describe('isExternallyOpenable', () => {
  it('accepts https and mailto only', () => {
    expect(isExternallyOpenable('https://example.com/page')).toBe(true)
    expect(isExternallyOpenable('mailto:user@example.com')).toBe(true)
  })

  it('rejects http, dangerous schemes, and garbage', () => {
    expect(isExternallyOpenable('http://example.com/')).toBe(false) // plaintext: inert by design
    expect(isExternallyOpenable('javascript:alert(1)')).toBe(false)
    expect(isExternallyOpenable('file:///etc/passwd')).toBe(false)
    expect(isExternallyOpenable('data:text/html,<script>x</script>')).toBe(false)
    expect(isExternallyOpenable('vbscript:msgbox')).toBe(false)
    expect(isExternallyOpenable('')).toBe(false)
    expect(isExternallyOpenable('just text')).toBe(false)
  })
})
