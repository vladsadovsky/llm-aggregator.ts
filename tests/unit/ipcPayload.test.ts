import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { toIpcPayload } from '../../src/utils/ipcPayload'

describe('toIpcPayload', () => {
  it('strips Vue reactive proxies so structured clone can serialize the value', () => {
    const experimentalFeatures = ref({ localOllamaProvider: true })
    const ollamaConnection = ref({ endpoint: 'http://127.0.0.1:11434' })
    const selfHosted = reactive({
      endpoint: 'https://dgx.example/v1',
      trustedHosts: ['dgx.example'],
      allowInsecureLanHttp: false,
    })

    const payload = toIpcPayload({
      dataDirectory: '/tmp/archive',
      llmProvider: 'ollama',
      llmModel: 'llama3',
      lensEnabled: false,
      tagEnforcement: 'warn' as const,
      tagSoftLimit: 50,
      tagHardLimit: 100,
      allowDevEnvSecrets: false,
      experimentalFeatures: experimentalFeatures.value,
      providerConnections: {
        ollama: ollamaConnection.value,
        selfHostedOpenAi: {
          ...selfHosted,
          trustedHosts: [...selfHosted.trustedHosts],
        },
      },
    })

    // structuredClone is the same algorithm Electron uses for IPC arguments.
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload.experimentalFeatures).toEqual({ localOllamaProvider: true })
    expect(payload.providerConnections.ollama).toEqual({ endpoint: 'http://127.0.0.1:11434' })
    expect(payload.providerConnections.selfHostedOpenAi.trustedHosts).toEqual(['dgx.example'])
  })

  it('throws when structuredClone is given the raw Vue proxy payload', () => {
    const experimentalFeatures = ref({ localOllamaProvider: true })
    const raw = {
      experimentalFeatures: experimentalFeatures.value,
    }
    expect(() => structuredClone(raw)).toThrow(/could not be cloned|DataCloneError|clone/i)
  })
})
