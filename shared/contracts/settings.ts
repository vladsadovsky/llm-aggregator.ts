/** Settings and secrets IPC payload schemas. */
import { z } from 'zod'
import { boundedString, boundedInt } from './common'

const ProviderConnectionSchema = z.object({
  /** Fully-qualified API base URL, including any server-specific path prefix. */
  endpoint: boundedString(2048).optional(),
  /** Model used for embeddings when it differs from the selected completion model. */
  embeddingModel: boundedString(128).optional(),
  /** Exact trusted LAN hostnames/IPs for a self-hosted endpoint. */
  trustedHosts: z.array(boundedString(253)).max(32).optional(),
  /** Development-only temporary exception; never honoured in packaged builds. */
  allowInsecureLanHttp: z.boolean().optional(),
  /** Azure API version, required only when Azure is selected. */
  apiVersion: boundedString(64).optional(),
})

export const AppSettingsSchema = z
  .object({
    dataDirectory: boundedString(4096),
    llmProvider: boundedString(64),
    llmModel: boundedString(128),
    lensEnabled: z.boolean(),
    tagEnforcement: z.enum(['off', 'warn', 'strict']),
    tagSoftLimit: boundedInt(0, 100_000),
    tagHardLimit: boundedInt(0, 100_000),
    allowDevEnvSecrets: z.boolean(),
    providerConnections: z
      .object({
        ollama: ProviderConnectionSchema.optional(),
        azure: ProviderConnectionSchema.optional(),
        selfHostedOpenAi: ProviderConnectionSchema.optional(),
      })
      .optional(),
    // Experimental flags: id → boolean. Bounded so a hostile settings file cannot
    // carry an unbounded map. Unknown ids are preserved but resolve false.
    experimentalFeatures: z.record(boundedString(64), z.boolean()).optional(),
  })
  .strict()

export type AppSettingsContract = z.infer<typeof AppSettingsSchema>

/** A partial secrets update — only the keys the user actually edited. */
export const SecretsUpdateSchema = z
  .object({
    openaiApiKey: boundedString(1024).optional(),
    anthropicApiKey: boundedString(1024).optional(),
    azureApiKey: boundedString(1024).optional(),
    selfHostedApiKey: boundedString(1024).optional(),
  })
  .strict()

export type SecretsUpdateContract = z.infer<typeof SecretsUpdateSchema>
