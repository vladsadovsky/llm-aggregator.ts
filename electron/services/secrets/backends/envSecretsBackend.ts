import type {
  AppSecrets,
  SecretBackend,
  SecretWarning,
} from '../secretBackendTypes'

/**
 * Fixed prefix for development environment overrides.
 *
 * Deliberately not user-configurable: the value is concatenated into a
 * `process.env` lookup, and a free-form prefix would need validation to stay a
 * legal variable name while buying nothing a constant does not.
 */
export const DEV_ENV_SECRET_PREFIX = 'LLM_AGG_'

const ENV_VAR_BY_KEY: Record<keyof AppSecrets, string> = {
  openaiApiKey: `${DEV_ENV_SECRET_PREFIX}OPENAI_API_KEY`,
  anthropicApiKey: `${DEV_ENV_SECRET_PREFIX}ANTHROPIC_API_KEY`,
  azureApiKey: `${DEV_ENV_SECRET_PREFIX}AZURE_OPENAI_API_KEY`,
  selfHostedApiKey: `${DEV_ENV_SECRET_PREFIX}SELF_HOSTED_API_KEY`,
}

/** The environment variable names this backend reads, for display in Settings. */
export function devEnvSecretVarNames(): string[] {
  return Object.values(ENV_VAR_BY_KEY)
}

export interface EnvSecretsBackendOptions {
  /** Process environment to read. Injected so tests need no global mutation. */
  env: NodeJS.ProcessEnv
  /** `app.isPackaged`. Env overrides are refused in packaged builds. */
  isPackaged: boolean
  /** `settings.allowDevEnvSecrets`. */
  allowDevEnvSecrets: boolean
}

/**
 * Development-only, read-only overlay sourced from prefixed environment variables.
 *
 * Active only when the setting is on AND the build is unpackaged — the setting
 * alone is not sufficient, because `settings.json` travels with the user's
 * profile and would otherwise silently apply to a production install.
 */
export function createEnvSecretsBackend(options: EnvSecretsBackendOptions): SecretBackend {
  const { env, isPackaged, allowDevEnvSecrets } = options

  const anyEnvVarPresent = (): boolean =>
    Object.values(ENV_VAR_BY_KEY).some(name => env[name] !== undefined)

  const isActive = (): boolean => allowDevEnvSecrets && !isPackaged

  return {
    id: 'env',
    writable: false,

    isAvailable: isActive,

    load() {
      const warnings: SecretWarning[] = []

      if (!isActive()) {
        // Only warn when there is actually something being ignored, so a normal
        // production run stays silent.
        if (anyEnvVarPresent()) {
          warnings.push(
            allowDevEnvSecrets && isPackaged
              ? {
                code: 'ENV_IGNORED_PACKAGED',
                message: 'Development environment variables are ignored in packaged builds. Stored keys are being used instead.',
              }
              : {
                code: 'ENV_DISABLED',
                message: `Environment variables (${devEnvSecretVarNames().join(', ')}) are set but the development override is switched off in Settings.`,
              },
          )
        }
        return { secrets: {}, warnings }
      }

      const secrets: Partial<AppSecrets> = {}
      for (const [key, varName] of Object.entries(ENV_VAR_BY_KEY) as Array<[keyof AppSecrets, string]>) {
        const raw = env[varName]
        if (raw === undefined) {
          continue
        }
        const value = raw.trim()
        if (!value) {
          warnings.push({
            code: 'ENV_MALFORMED',
            message: `${varName} is set but empty; it will be ignored.`,
          })
          continue
        }
        secrets[key] = value
      }

      return { secrets, warnings }
    },

    save() {
      // `env` is a read-only overlay: writes always target safeStorage. The
      // resolver never calls this, but the interface requires it to exist.
      throw new Error('Environment secret overrides are read-only.')
    },
  }
}
