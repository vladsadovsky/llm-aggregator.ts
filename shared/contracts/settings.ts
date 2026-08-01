/** Settings and secrets IPC payload schemas. */
import { z } from 'zod'
import { boundedString, boundedInt } from './common'

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
  })
  .strict()

export type AppSettingsContract = z.infer<typeof AppSettingsSchema>

/** A partial secrets update — only the keys the user actually edited. */
export const SecretsUpdateSchema = z
  .object({
    openaiApiKey: boundedString(1024).optional(),
    anthropicApiKey: boundedString(1024).optional(),
  })
  .strict()

export type SecretsUpdateContract = z.infer<typeof SecretsUpdateSchema>
