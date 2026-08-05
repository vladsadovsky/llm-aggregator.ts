import { describe, it, expect, beforeEach } from 'vitest'
import {
  getEmbedReadiness,
  markEmbedReady,
  markEmbedUnavailable,
  readinessMatches,
  resetEmbedReadiness,
} from '../../electron/services/llm/embedReadiness'

beforeEach(() => resetEmbedReadiness())

describe('embedReadiness', () => {
  it('starts unknown', () => {
    expect(getEmbedReadiness().state).toBe('unknown')
  })

  it('remembers a successful probe for a fingerprint', () => {
    markEmbedReady('openai|gpt-4o')
    expect(getEmbedReadiness()).toMatchObject({
      state: 'ready',
      fingerprint: 'openai|gpt-4o',
    })
    expect(readinessMatches('openai|gpt-4o')).toBe(true)
  })

  it('treats a different fingerprint as a mismatch', () => {
    markEmbedUnavailable('openai|gpt-4o', 'no embeddings')
    expect(readinessMatches('azure|gpt4o')).toBe(false)
  })

  it('stores a safe unavailable reason', () => {
    markEmbedUnavailable('ollama|nomic', 'model missing')
    expect(getEmbedReadiness()).toMatchObject({
      state: 'unavailable',
      reason: 'model missing',
    })
  })
})
