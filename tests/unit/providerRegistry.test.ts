/**
 * INV-LLM: providers declare capabilities as data; the UI and factories select
 * by capability, not provider name.
 */
import { describe, it, expect } from 'vitest'
import {
  listProviderDescriptors,
  getProviderDescriptor,
  providerSupports,
} from '../../electron/services/llm/providerRegistry'

describe('provider registry capabilities', () => {
  it('every descriptor declares all four capabilities as booleans', () => {
    for (const d of listProviderDescriptors()) {
      expect(d.capabilities).toEqual({
        complete: expect.any(Boolean),
        embed: expect.any(Boolean),
        streaming: expect.any(Boolean),
        local: expect.any(Boolean),
      })
    }
  })

  it('has unique provider ids', () => {
    const ids = listProviderDescriptors().map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('openai supports embeddings; anthropic supports completion but not embeddings', () => {
    expect(providerSupports('openai', 'embed')).toBe(true)
    expect(providerSupports('openai', 'complete')).toBe(true)
    expect(providerSupports('anthropic', 'complete')).toBe(true)
    expect(providerSupports('anthropic', 'embed')).toBe(false)
  })

  it('an unknown provider supports nothing', () => {
    expect(providerSupports('mystery', 'complete')).toBe(false)
    expect(getProviderDescriptor('mystery')).toBeNull()
  })
})
