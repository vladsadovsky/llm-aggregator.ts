/**
 * Phase 0.1: the Azure OpenAI endpoint must be HTTPS, credential-free,
 * default-port, fragment-free, and on an approved Azure host.
 */
import { describe, it, expect } from 'vitest'
import { validateAzureEndpoint } from '../../electron/services/llm/azureEndpointPolicy'

describe('validateAzureEndpoint', () => {
  it('accepts an approved Azure host', () => {
    expect(validateAzureEndpoint('https://my-resource.openai.azure.com').ok).toBe(true)
    expect(validateAzureEndpoint('https://foo.cognitiveservices.azure.com').ok).toBe(true)
  })

  it('normalizes to the origin, dropping any path', () => {
    expect(validateAzureEndpoint('https://my-resource.openai.azure.com/openai/x').origin).toBe(
      'https://my-resource.openai.azure.com',
    )
  })

  it('rejects non-HTTPS, credentials, ports, fragments', () => {
    expect(validateAzureEndpoint('http://my-resource.openai.azure.com').reason).toBe('insecure-scheme')
    expect(validateAzureEndpoint('https://u:p@my-resource.openai.azure.com').reason).toBe('has-credentials')
    expect(validateAzureEndpoint('https://my-resource.openai.azure.com:8443').reason).toBe('non-default-port')
    expect(validateAzureEndpoint('https://my-resource.openai.azure.com/#x').reason).toBe('has-fragment')
  })

  it('rejects unknown and look-alike hosts', () => {
    expect(validateAzureEndpoint('https://evil.example').reason).toBe('host-not-allowed')
    expect(validateAzureEndpoint('https://openai.azure.com.evil.example').reason).toBe('host-not-allowed')
    // Bare suffix with nothing in front is not a real resource host.
    expect(validateAzureEndpoint('https://openai.azure.com').reason).toBe('host-not-allowed')
  })
})
